import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { idempotence } from "../lib/idempotence.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireAtelier, requireAbonnementActif } from "../middlewares/auth.middleware.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { formatZodError } from "../lib/validation.js";
import { isUniqueConstraintViolation } from "../lib/prismaErrors.js";
import { journaliserSecurite } from "../lib/securityLog.js";
import { rateLimitPersistant } from "../lib/rateLimiter.js";
import { catalogueSerialise, normaliserPermissions, sensiblesAjoutees, POSTES } from "../lib/permissions.js";
import { STATUTS_OUVERTS } from "../lib/production.js";
import {
  createEmployeSchema,
  updateEmployeSchema,
  motDePasseEmployeSchema,
  decisionEmployeSchema,
  listEmployesQuerySchema,
} from "../schemas/employe.schema.js";
import { exigerQuota, verrouillerQuota, verifierQuota } from "../lib/quotasServeur.js";

// Gestion des employés de l'atelier — RÉSERVÉE AU PDG (compte ADMIN) : un employé reçoit toujours 403 ici, quelles que
// soient ses permissions (l'administration de l'atelier n'est jamais déléguable). Toute requête est cloisonnée à
// l'atelier du PDG et ne touche que des comptes EMPLOYE : les comptes ADMIN (PDG) et USER sont invisibles ici (404).
const router = Router();
router.use(requireAuth, requireAtelier, requireAbonnementActif);
router.param("id", requireValidIdParam);

const EMPLOYE_SELECT = {
  id: true,
  identifiant: true,
  prenom: true,
  nom: true,
  email: true,
  telephone: true,
  poste: true,
  permissions: true,
  actif: true,
  desactiveLe: true,
  createdAt: true,
  derniereConnexionAt: true,
};

const limiteConfirmation = rateLimitPersistant({
  prefixe: "confirmation-pdg",
  limite: 10,
  fenetreMs: 15 * 60 * 1000,
  message: "Trop de confirmations en peu de temps. Réessayez dans quelques minutes.",
});
const limiter = (req, res) => new Promise((resolve, reject) => limiteConfirmation(req, res, (err) => (err ? reject(err) : resolve())));

/**
 * Confirmation d'une opération SENSIBLE par le mot de passe du PDG : attribuer un droit qui donne accès à l'argent,
 * réinitialiser le mot de passe d'un employé. Protège contre un poste laissé ouvert ou une session volée. Le nombre
 * d'essais est limité (jamais un moyen de deviner le mot de passe du PDG).
 */
async function exigerConfirmation(req, motDePasse) {
  if (req.user.impersonatedBy) {
    throw new HttpError(403, "Cette opération exige le mot de passe du PDG : elle n'est pas disponible pendant une impersonation.");
  }
  if (!motDePasse) {
    throw new HttpError(403, "Cette opération est sensible : confirmez avec votre mot de passe.", { confirmationMotDePasse: ["Votre mot de passe est requis."] });
  }
  await limiter(req, req.res);
  const pdg = await prisma.user.findUnique({ where: { id: req.user.id }, select: { passwordHash: true } });
  const valide = pdg ? await bcrypt.compare(motDePasse, pdg.passwordHash) : false;
  if (!valide) {
    await journaliserSecurite("EMPLOYE_CONFIRMATION_ECHEC", { req, userId: req.user.id, atelierId: req.user.atelierId });
    throw new HttpError(403, "Mot de passe de confirmation incorrect.", { confirmationMotDePasse: ["Mot de passe incorrect."] });
  }
}

function permissionsOuErreur(liste) {
  try {
    return normaliserPermissions(liste);
  } catch (err) {
    if (err.inconnues) throw new HttpError(400, "Champs invalides.", { permissions: [`Permissions inconnues : ${err.inconnues.join(", ")}`] });
    throw err;
  }
}

async function chargerEmploye(req) {
  const employe = await prisma.user.findFirst({
    where: { id: req.params.id, atelierId: req.user.atelierId, role: "EMPLOYE" },
    select: EMPLOYE_SELECT,
  });
  if (!employe) throw new HttpError(404, "Employé introuvable.");
  return employe;
}

function traduireConflit(err) {
  if (isUniqueConstraintViolation(err, "identifiant")) {
    return new HttpError(409, "Cet identifiant est déjà utilisé.", { identifiant: ["Cet identifiant est déjà utilisé."] });
  }
  if (isUniqueConstraintViolation(err, "email")) {
    return new HttpError(409, "Cet email est déjà utilisé.", { email: ["Cet email est déjà utilisé."] });
  }
  return err;
}

// GET /api/employes/catalogue — permissions disponibles (par module, avec les droits sensibles) et postes.
router.get("/catalogue", (req, res) => {
  res.json(catalogueSerialise());
});

// GET /api/employes?q=&actif=true|false|all
router.get("/", async (req, res) => {
  const parsed = listEmployesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { q, actif, page, pageSize } = parsed.data;
  const where = {
    atelierId: req.user.atelierId,
    role: "EMPLOYE",
    ...(actif === "all" ? {} : { actif: actif === "true" }),
    ...(q
      ? {
          OR: [
            { prenom: { contains: q, mode: "insensitive" } },
            { nom: { contains: q, mode: "insensitive" } },
            { identifiant: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, data] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ actif: "desc" }, { nom: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: EMPLOYE_SELECT,
    }),
  ]);
  res.json({ data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});

router.get("/:id", async (req, res) => {
  res.json(await chargerEmploye(req));
});

// POST /api/employes — création. Permissions de départ = celles du poste, sauf si le PDG en fixe d'autres.
router.post("/", idempotence, async (req, res) => {
  const parsed = createEmployeSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const { identifiant, password, prenom, nom, poste, email, telephone, confirmationMotDePasse } = parsed.data;
  const permissions = permissionsOuErreur(parsed.data.permissions ?? POSTES[poste]);

  if (sensiblesAjoutees([], permissions).length > 0) await exigerConfirmation(req, confirmationMotDePasse);

  const passwordHash = await bcrypt.hash(password, 12);
  let employe;
  try {
    employe = await prisma.$transaction(
      async (tx) => {
        await exigerQuota(tx, { atelierId: req.user.atelierId, ressource: "employes" });
        return tx.user.create({
          data: { identifiant, passwordHash, role: "EMPLOYE", atelierId: req.user.atelierId, prenom, nom, email, telephone, poste, permissions },
          select: EMPLOYE_SELECT,
        });
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  } catch (err) {
    throw traduireConflit(err);
  }
  await journaliserSecurite("EMPLOYE_CREE", { req, userId: req.user.id, atelierId: req.user.atelierId, details: { compteId: employe.id } });
  res.status(201).json(employe);
});

// PATCH /api/employes/:id — identité, poste, permissions. Changer le poste ne réécrit JAMAIS les permissions déjà
// accordées ; seules des permissions explicitement envoyées les modifient. Ajouter un droit sensible exige le mot de
// passe du PDG ; en retirer, jamais.
router.patch("/:id", async (req, res) => {
  const parsed = updateEmployeSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const existant = await chargerEmploye(req);
  const { confirmationMotDePasse, permissions: permissionsDemandees, ...champs } = parsed.data;

  const data = { ...champs };
  let permissionsModifiees = false;
  if (permissionsDemandees !== undefined) {
    const nouvelles = permissionsOuErreur(permissionsDemandees);
    if (sensiblesAjoutees(existant.permissions, nouvelles).length > 0) await exigerConfirmation(req, confirmationMotDePasse);
    data.permissions = nouvelles;
    permissionsModifiees = JSON.stringify(nouvelles) !== JSON.stringify([...existant.permissions].sort());
  }

  let employe;
  try {
    employe = await prisma.user.update({ where: { id: existant.id }, data, select: EMPLOYE_SELECT });
  } catch (err) {
    throw traduireConflit(err);
  }
  await journaliserSecurite(permissionsModifiees ? "EMPLOYE_PERMISSIONS_MODIFIEES" : "EMPLOYE_MODIFIE", {
    req,
    userId: req.user.id,
    atelierId: req.user.atelierId,
    details: { compteId: employe.id },
  });
  res.json(employe);
});

// POST /api/employes/:id/desactiver — le compte ne peut plus se connecter et sa session ouverte est coupée tout de
// suite (version de session incrémentée). Rien n'est supprimé : les actions passées restent attribuées. Répétable.
router.post("/:id/desactiver", async (req, res) => {
  const parsed = decisionEmployeSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const existant = await chargerEmploye(req);
  if (!existant.actif) return res.json({ ...existant, dejaTraite: true });
  // Les commandes encore ouvertes qui lui étaient confiées redeviennent « non affectées » (avec trace dans l'historique) :
  // personne ne doit attendre le travail d'un compte désactivé. Tout ou rien avec la désactivation.
  const employe = await prisma.$transaction(async (tx) => {
    const aRetirer = await tx.commande.findMany({
      where: { atelierId: req.user.atelierId, assigneAId: existant.id, statut: { in: STATUTS_OUVERTS } },
      select: { id: true },
    });
    if (aRetirer.length > 0) {
      await tx.commande.updateMany({ where: { id: { in: aRetirer.map((c) => c.id) } }, data: { assigneAId: null, assigneLe: null } });
      await tx.affectationCommande.createMany({
        data: aRetirer.map((c) => ({ atelierId: req.user.atelierId, commandeId: c.id, employeId: null, parId: req.user.id })),
      });
    }
    return tx.user.update({
      where: { id: existant.id },
      data: { actif: false, desactiveLe: new Date(), sessionVersion: { increment: 1 } },
      select: EMPLOYE_SELECT,
    });
  });
  await journaliserSecurite("EMPLOYE_DESACTIVE", { req, userId: req.user.id, atelierId: req.user.atelierId, details: { compteId: employe.id } });
  res.json({ ...employe, dejaTraite: false });
});

router.post("/:id/reactiver", async (req, res) => {
  const parsed = decisionEmployeSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const existant = await chargerEmploye(req);
  if (existant.actif) return res.json({ ...existant, dejaTraite: true });
  // Réactiver un compte l'ajoute au quota d'employés : même verrou et même contrôle que la création. L'état est relu sous
  // le verrou : deux réactivations simultanées du même compte n'en comptent qu'une.
  const { employe, deja } = await prisma.$transaction(
    async (tx) => {
      await verrouillerQuota(tx, req.user.atelierId, "employes");
      const courant = await tx.user.findFirst({ where: { id: existant.id, atelierId: req.user.atelierId, role: "EMPLOYE" }, select: EMPLOYE_SELECT });
      if (courant?.actif) return { employe: courant, deja: true };
      await verifierQuota(tx, { atelierId: req.user.atelierId, ressource: "employes" });
      const maj = await tx.user.update({ where: { id: existant.id }, data: { actif: true, desactiveLe: null }, select: EMPLOYE_SELECT });
      return { employe: maj, deja: false };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  if (deja) return res.json({ ...employe, dejaTraite: true });
  await journaliserSecurite("EMPLOYE_REACTIVE", { req, userId: req.user.id, atelierId: req.user.atelierId, details: { compteId: employe.id } });
  res.json({ ...employe, dejaTraite: false });
});

// POST /api/employes/:id/mot-de-passe — le PDG fixe un nouveau mot de passe (confirmé par le sien). Les sessions
// ouvertes de l'employé sont coupées.
router.post("/:id/mot-de-passe", async (req, res) => {
  const parsed = motDePasseEmployeSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const existant = await chargerEmploye(req);
  await exigerConfirmation(req, parsed.data.confirmationMotDePasse);
  const passwordHash = await bcrypt.hash(parsed.data.nouveauMotDePasse, 12);
  await prisma.user.update({ where: { id: existant.id }, data: { passwordHash, sessionVersion: { increment: 1 } } });
  await journaliserSecurite("EMPLOYE_MDP_REINITIALISE", { req, userId: req.user.id, atelierId: req.user.atelierId, details: { compteId: existant.id } });
  res.status(204).end();
});

export default router;
