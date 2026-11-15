import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireMembreAtelier, requireAbonnementActif, droitsParModule } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { verrouillerCle } from "../lib/verrous.js";
import { createFournisseurSchema, updateFournisseurSchema, listFournisseursQuerySchema } from "../schemas/fournisseur.schema.js";

const router = Router();

// Membres de l'atelier ; un employé a besoin de « fournisseurs.lire » (GET) ou « fournisseurs.ecrire » (autres méthodes).
// Aucune donnée financière ici : pas de masquage. Les achats (6.5) auront leurs propres droits.
router.use(requireAuth, requireMembreAtelier, requireAbonnementActif, droitsParModule("fournisseurs"));
router.param("id", requireValidIdParam);

// Verrou consultatif : atelier + nom en minuscules (même comparaison, insensible à la casse, que la vérification).
const cleFournisseur = (atelierId, nom) => `fournisseur:${atelierId}:${String(nom).trim().replace(/\s+/g, " ").toLowerCase()}`;

async function assertNomDisponible(client, atelierId, nom, excludeId) {
  const existant = await client.fournisseur.findFirst({
    where: { atelierId, nom: { equals: nom, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, nom: true, archivedAt: true },
  });
  if (existant) {
    throw new HttpError(409, "Un fournisseur porte déjà ce nom.", { fournisseurId: existant.id, nom: existant.nom, archive: Boolean(existant.archivedAt) });
  }
}

// POST /api/fournisseurs
router.post("/", async (req, res) => {
  const parsed = createFournisseurSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const data = parsed.data;
  const fournisseur = await prisma.$transaction(
    async (tx) => {
      await verrouillerCle(tx, cleFournisseur(req.user.atelierId, data.nom));
      await assertNomDisponible(tx, req.user.atelierId, data.nom);
      return tx.fournisseur.create({ data: { ...data, atelierId: req.user.atelierId } });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  res.status(201).json(fournisseur);
});

// GET /api/fournisseurs — liste, recherche (nom, contact, téléphone, email), archivage, pagination
router.get("/", async (req, res) => {
  const parsed = listFournisseursQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres de recherche invalides.", formatZodError(parsed.error));
  const { q, archived, page, pageSize } = parsed.data;

  const where = { atelierId: req.user.atelierId };
  if (archived === "false") where.archivedAt = null;
  else if (archived === "true") where.archivedAt = { not: null };
  if (q) {
    where.OR = [
      { nom: { contains: q, mode: "insensitive" } },
      { contact: { contains: q, mode: "insensitive" } },
      { telephone: { contains: q } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.fournisseur.findMany({ where, orderBy: [{ nom: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.fournisseur.count({ where }),
  ]);
  res.json({ data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});

// GET /api/fournisseurs/:id — consultation (y compris archivé)
router.get("/:id", async (req, res) => {
  const fournisseur = await prisma.fournisseur.findFirst({ where: { id: req.params.id, atelierId: req.user.atelierId } });
  if (!fournisseur) throw new HttpError(404, "Fournisseur introuvable.");
  res.json(fournisseur);
});

// PATCH /api/fournisseurs/:id — interdit sur un fournisseur archivé
router.patch("/:id", async (req, res) => {
  const parsed = updateFournisseurSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const data = parsed.data;
  const { id } = req.params;
  const { atelierId } = req.user;

  const courant = await prisma.fournisseur.findFirst({ where: { id, atelierId }, select: { archivedAt: true } });
  if (!courant) throw new HttpError(404, "Fournisseur introuvable.");
  if (courant.archivedAt) throw new HttpError(409, "Fournisseur archivé : restaurez-le avant de le modifier.");

  const resultat = await prisma.$transaction(
    async (tx) => {
      if (data.nom !== undefined) {
        await verrouillerCle(tx, cleFournisseur(atelierId, data.nom));
        await assertNomDisponible(tx, atelierId, data.nom, id);
      }
      // Condition sur archivedAt : garde-fou atomique contre un archivage concurrent.
      return tx.fournisseur.updateMany({ where: { id, atelierId, archivedAt: null }, data });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  if (resultat.count === 0) throw new HttpError(409, "Fournisseur archivé : restaurez-le avant de le modifier.");
  res.json(await prisma.fournisseur.findUnique({ where: { id } }));
});

// POST /api/fournisseurs/:id/archiver — jamais de suppression physique
router.post("/:id/archiver", async (req, res) => {
  const { id } = req.params;
  const r = await prisma.fournisseur.updateMany({ where: { id, atelierId: req.user.atelierId, archivedAt: null }, data: { archivedAt: new Date() } });
  if (r.count === 0) {
    const existant = await prisma.fournisseur.findFirst({ where: { id, atelierId: req.user.atelierId }, select: { id: true } });
    if (!existant) throw new HttpError(404, "Fournisseur introuvable.");
    throw new HttpError(409, "Fournisseur déjà archivé.");
  }
  res.json(await prisma.fournisseur.findUnique({ where: { id } }));
});

// POST /api/fournisseurs/:id/restaurer
router.post("/:id/restaurer", async (req, res) => {
  const { id } = req.params;
  const r = await prisma.fournisseur.updateMany({ where: { id, atelierId: req.user.atelierId, archivedAt: { not: null } }, data: { archivedAt: null } });
  if (r.count === 0) {
    const existant = await prisma.fournisseur.findFirst({ where: { id, atelierId: req.user.atelierId }, select: { id: true } });
    if (!existant) throw new HttpError(404, "Fournisseur introuvable.");
    throw new HttpError(409, "Fournisseur déjà actif.");
  }
  res.json(await prisma.fournisseur.findUnique({ where: { id } }));
});

export default router;
