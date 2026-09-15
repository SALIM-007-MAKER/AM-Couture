import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { loginSchema, motDePasseOublieSchema, reinitialiserMotDePasseTokenSchema } from "../schemas/auth.schema.js";
import { inscriptionAtelierSchema } from "../schemas/atelierAdmin.schema.js";
import { signAuthToken, verifyAuthToken } from "../lib/jwt.js";
import { setAuthCookie, clearAuthCookie, COOKIE_NAME } from "../lib/authCookie.js";
import { formatZodError } from "../lib/validation.js";
import { creerAtelierEtAdmin } from "../lib/atelierProvisioning.js";
import { creerToken, consommerToken } from "../lib/tokenAction.js";
import { envoyerEmail } from "../lib/resend.js";
import { emailVerificationTemplate, emailReinitialisationTemplate } from "../lib/emailTemplates.js";

const router = Router();

// Hash bcrypt factice (mot de passe jamais utilisé ailleurs) comparé quand
// l'identifiant n'existe pas, pour que bcrypt.compare prenne un temps
// comparable dans les deux cas et empêche l'énumération de comptes par
// mesure du temps de réponse.
const DUMMY_HASH = "$2b$10$/4y/w0cvEjmIpLaIBO4xNOLAdvUoH3oNwzYFeJ7fUnPvdyqtJ22de";

// Rate limiting sur /login uniquement : 10 tentatives / 15 min / IP.
// Réponse volontairement générique pour ne pas aider un attaquant à calibrer.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez dans quelques minutes." },
});

// Rate limiting sur la recherche de branding par identifiant : plus large
// que login (usage attendu : quelques requêtes par frappe/debounce), mais
// borné pour freiner une énumération en masse des identifiants existants.
const brandingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requêtes. Réessayez dans quelques minutes." },
});

// GET /api/auth/atelier-pour-identifiant?identifiant=... — utilisé UNIQUEMENT
// par LoginPage pour afficher le logo/nom de l'atelier correspondant AVANT
// connexion, dès que l'identifiant tapé est reconnu (Phase 8 — décision
// explicite : accepter une légère fuite d'existence d'identifiant en échange
// d'un meilleur affichage de marque par atelier). Toujours un 200 avec un
// objet à null plutôt qu'un 404 franc — ne donne pas à un énumérateur un
// signal net "existe / n'existe pas" basé sur le code HTTP — et fortement
// rate-limité (voir brandingLimiter) pour freiner l'énumération en masse.
// Un SUPERADMIN (atelierId null) retombe naturellement sur {nom:null,
// logoUrl:null}, donc sur l'icône générique — comportement correct sans cas
// particulier à gérer.
router.get("/atelier-pour-identifiant", brandingLimiter, async (req, res) => {
  const identifiant = typeof req.query.identifiant === "string" ? req.query.identifiant.trim() : "";
  // Seuil aligné sur le minimum de 3 caractères exigé à la création d'un
  // identifiant (voir atelierAdmin.schema.js) — inutile d'interroger la base
  // en dessous, aucun identifiant réel ne peut faire moins.
  if (identifiant.length < 3) {
    return res.json({ nom: null, logoUrl: null });
  }
  const user = await prisma.user.findUnique({
    where: { identifiant },
    select: { atelier: { select: { nom: true, logoUrl: true } } },
  });
  res.json({ nom: user?.atelier?.nom ?? null, logoUrl: user?.atelier?.logoUrl ?? null });
});

router.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const { identifiant, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { identifiant } });
  const passwordHash = user?.passwordHash ?? DUMMY_HASH;
  const valid = await bcrypt.compare(password, passwordHash);

  // Message volontairement identique dans les deux cas (identifiant inconnu
  // ou mot de passe faux) : ne jamais révéler quel champ est incorrect.
  if (!user || !valid) {
    throw new HttpError(401, "Identifiant ou mot de passe incorrect.");
  }

  // Fil d'activité SUPERADMIN (voir GET /api/ateliers/:id/activite) — pas
  // attendu avant la réponse : une connexion réussie ne doit jamais échouer
  // ou ralentir à cause de cet horodatage, purement informatif.
  prisma.user.update({ where: { id: user.id }, data: { derniereConnexionAt: new Date() } }).catch(() => {});

  const token = signAuthToken(user);
  setAuthCookie(res, token);
  res.json({ id: user.id, identifiant: user.identifiant, role: user.role, atelierId: user.atelierId });
});

// Rate limiting sur l'inscription : plus strict que le login (10/15min) —
// cette route, non-authentifiée, crée des lignes en base (un atelier + un
// compte), pas juste une vérification. 5 tentatives / heure / IP suffisent à
// un usage légitime (une poignée d'essais en cas d'identifiant déjà pris)
// tout en limitant la création en masse d'ateliers factices.
const inscriptionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez plus tard." },
});

// Bloque l'inscription si un cookie de session VALIDE est déjà présent —
// cette route n'exige pas d'authentification (elle doit rester utilisable
// par un visiteur totalement anonyme), mais ne doit pas non plus permettre à
// un compte déjà connecté (ADMIN d'un autre atelier, ou même SUPERADMIN) de
// créer discrètement un atelier supplémentaire sans repasser par la console
// SUPERADMIN (voir ateliers.routes.js) — la création d'ateliers "hors
// SUPERADMIN" doit rester réservée à un nouveau venu, jamais à un compte
// existant. Un token absent/invalide/expiré est traité comme "non connecté"
// et laisse passer normalement.
function rejectIfDejaConnecte(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      verifyAuthToken(token);
      return next(
        new HttpError(
          409,
          "Vous êtes déjà connecté à un compte. Déconnectez-vous avant de créer un nouvel atelier.",
        ),
      );
    } catch {
      // Token invalide/expiré : rien à bloquer, l'utilisateur n'est pas
      // réellement connecté du point de vue du serveur.
    }
  }
  next();
}

// POST /api/auth/inscription-atelier — un propriétaire d'atelier crée LUI-MÊME
// son atelier + son compte ADMIN, sans intervention du SUPERADMIN (Phase 8 —
// inscription en libre-service, décision ultérieure à l'audit initial qui
// avait réservé cette création au SUPERADMIN). Toujours possible en parallèle
// via POST /api/ateliers (SUPERADMIN) — voir ateliers.routes.js. Termine par
// une connexion immédiate (même cookie que /login) : un nouvel atelier doit
// pouvoir être utilisé tout de suite, pas demander une seconde étape de login.
router.post("/inscription-atelier", inscriptionLimiter, rejectIfDejaConnecte, async (req, res) => {
  const parsed = inscriptionAtelierSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const { nom, prenom, nomProprietaire, email, adminPassword, telephone, ville, pays, devise, langue } = parsed.data;

  const { admin } = await creerAtelierEtAdmin({
    // Repli si le nom d'atelier est laissé vide (champ optionnel ici, voir
    // atelierAdmin.schema.js) — un propriétaire pressé peut le renommer
    // ensuite depuis Paramètres.
    nom: nom || `Atelier de ${prenom}`,
    devise,
    telephone,
    ville,
    pays,
    // L'email sert directement d'identifiant de connexion — pas de champ
    // "identifiant" séparé dans ce formulaire (voir InscriptionAtelierPage.jsx).
    adminIdentifiant: email,
    adminPassword,
    prenom,
    nomProprietaire,
    email,
    langue,
    identifiantErrorField: "email",
    identifiantErrorMessage: "Cet email est déjà utilisé.",
  });

  // Email de vérification — "best effort" : un envoi qui échoue (clé Resend
  // manquante, panne réseau...) ne doit JAMAIS empêcher la création du
  // compte, déjà faite avec succès juste au-dessus. Simplement journalisé
  // (visible dans les logs Vercel) plutôt que remonté au propriétaire de
  // l'atelier, qui a de toute façon un accès immédiat sans vérification
  // (voir décision : accès immédiat après inscription).
  creerToken({ userId: admin.id, type: "VERIFICATION_EMAIL", dureeMs: 24 * 60 * 60 * 1000 })
    .then((verifToken) => {
      const origin = `${req.protocol}://${req.get("host")}`;
      return envoyerEmail({
        to: admin.email,
        subject: "Confirmez votre email — Gestion d'Atelier",
        html: emailVerificationTemplate({
          prenom: admin.prenom,
          lienVerification: `${origin}/verifier-email?token=${verifToken}`,
        }),
      });
    })
    .catch((err) => {
      console.error(`[inscription-atelier] Échec de l'envoi de l'email de vérification à ${admin.email} :`, err.message);
    });

  const token = signAuthToken(admin);
  setAuthCookie(res, token);
  res.status(201).json({ id: admin.id, identifiant: admin.identifiant, role: admin.role, atelierId: admin.atelierId });
});

// GET /api/auth/verifier-email?token=... — lien cliqué depuis l'email de
// vérification (voir POST /inscription-atelier ci-dessus). Public : le
// jeton lui-même authentifie l'action, aucune session requise (l'email peut
// être ouvert sur un autre appareil que celui de l'inscription).
router.get("/verifier-email", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const user = await consommerToken({ token, type: "VERIFICATION_EMAIL" });
  await prisma.user.update({ where: { id: user.id }, data: { emailVerifieLe: new Date() } });
  res.json({ email: user.email });
});

const renvoyerVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez plus tard." },
});

// POST /api/auth/renvoyer-verification-email — authentifié (contrairement à
// mot-de-passe-oublie, pas de risque d'énumération ici : on agit sur le
// compte de la session en cours, jamais sur un identifiant fourni dans le
// corps de la requête).
router.post("/renvoyer-verification-email", requireAuth, renvoyerVerificationLimiter, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user.email) {
    throw new HttpError(400, "Aucun email associé à ce compte.");
  }
  if (user.emailVerifieLe) {
    throw new HttpError(400, "Cet email est déjà vérifié.");
  }
  const verifToken = await creerToken({ userId: user.id, type: "VERIFICATION_EMAIL", dureeMs: 24 * 60 * 60 * 1000 });
  const origin = `${req.protocol}://${req.get("host")}`;
  try {
    await envoyerEmail({
      to: user.email,
      subject: "Confirmez votre email — Gestion d'Atelier",
      html: emailVerificationTemplate({
        prenom: user.prenom,
        lienVerification: `${origin}/verifier-email?token=${verifToken}`,
      }),
    });
  } catch (err) {
    throw new HttpError(502, `Impossible d'envoyer l'email : ${err.message}`);
  }
  res.json({ message: "Email de vérification renvoyé." });
});

// Rate limiting sur la demande de réinitialisation : même ordre de grandeur
// que l'inscription (crée un jeton + déclenche un envoi d'email à chaque
// appel réussi) — 5 tentatives / heure / IP.
const motDePasseOublieLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez plus tard." },
});

// POST /api/auth/mot-de-passe-oublie — réponse TOUJOURS identique, que
// l'identifiant existe ou non, et qu'il ait un email ou non (ex: le compte
// "admin" historique, créé avant l'email) : ne jamais révéler par ce biais
// si un identifiant est enregistré sur la plateforme (même principe
// anti-énumération que /login, voir DUMMY_HASH plus haut).
router.post("/mot-de-passe-oublie", motDePasseOublieLimiter, async (req, res) => {
  const parsed = motDePasseOublieSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const message = "Si un compte existe avec cet identifiant et un email associé, un lien de réinitialisation vient de lui être envoyé.";

  const user = await prisma.user.findUnique({ where: { identifiant: parsed.data.identifiant } });
  if (user?.email) {
    creerToken({ userId: user.id, type: "REINITIALISATION_MOT_DE_PASSE", dureeMs: 60 * 60 * 1000 })
      .then((resetToken) => {
        const origin = `${req.protocol}://${req.get("host")}`;
        return envoyerEmail({
          to: user.email,
          subject: "Réinitialisation de votre mot de passe — Gestion d'Atelier",
          html: emailReinitialisationTemplate({
            lienReinitialisation: `${origin}/reinitialiser-mot-de-passe?token=${resetToken}`,
          }),
        });
      })
      .catch((err) => {
        console.error(`[mot-de-passe-oublie] Échec de l'envoi à ${user.email} :`, err.message);
      });
  }

  res.json({ message });
});

// POST /api/auth/reinitialiser-mot-de-passe-token — dernière étape du flux
// "mot de passe oublié" ci-dessus. Le jeton authentifie l'action (voir
// consommerToken) : aucune session requise.
router.post("/reinitialiser-mot-de-passe-token", async (req, res) => {
  const parsed = reinitialiserMotDePasseTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const user = await consommerToken({ token: parsed.data.token, type: "REINITIALISATION_MOT_DE_PASSE" });
  const passwordHash = await bcrypt.hash(parsed.data.nouveauMotDePasse, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.status(204).end();
});

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) {
    // Compte supprimé après émission du token : on invalide le cookie côté client.
    clearAuthCookie(res);
    throw new HttpError(401, "Session invalide.");
  }
  res.json({
    id: user.id,
    identifiant: user.identifiant,
    langue: user.langue,
    role: user.role,
    atelierId: user.atelierId,
    createdAt: user.createdAt,
    email: user.email,
    emailVerifieLe: user.emailVerifieLe,
  });
});

export default router;
