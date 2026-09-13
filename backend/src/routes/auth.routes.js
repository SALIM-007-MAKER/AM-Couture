import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { loginSchema } from "../schemas/auth.schema.js";
import { inscriptionAtelierSchema } from "../schemas/atelierAdmin.schema.js";
import { signAuthToken } from "../lib/jwt.js";
import { setAuthCookie, clearAuthCookie } from "../lib/authCookie.js";
import { formatZodError } from "../lib/validation.js";
import { creerAtelierEtAdmin } from "../lib/atelierProvisioning.js";

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

// POST /api/auth/inscription-atelier — un propriétaire d'atelier crée LUI-MÊME
// son atelier + son compte ADMIN, sans intervention du SUPERADMIN (Phase 8 —
// inscription en libre-service, décision ultérieure à l'audit initial qui
// avait réservé cette création au SUPERADMIN). Toujours possible en parallèle
// via POST /api/ateliers (SUPERADMIN) — voir ateliers.routes.js. Termine par
// une connexion immédiate (même cookie que /login) : un nouvel atelier doit
// pouvoir être utilisé tout de suite, pas demander une seconde étape de login.
router.post("/inscription-atelier", inscriptionLimiter, async (req, res) => {
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

  const token = signAuthToken(admin);
  setAuthCookie(res, token);
  res.status(201).json({ id: admin.id, identifiant: admin.identifiant, role: admin.role, atelierId: admin.atelierId });
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
  });
});

export default router;
