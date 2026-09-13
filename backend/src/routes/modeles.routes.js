import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireAtelier } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import {
  createModeleSchema,
  updateModeleSchema,
  listModelesQuerySchema,
} from "../schemas/modele.schema.js";

const router = Router();

// Toutes les routes Modèles exigent une session valide et un compte ADMIN
// rattaché à un atelier (Phase 8 — multi-tenant).
router.use(requireAuth, requireAtelier);

// Rétro-portage du garde-fou anti-octet-nul/caractères de contrôle — voir
// clientes.routes.js pour le contexte complet (point ouvert depuis le module 5).
router.param("id", requireValidIdParam);

/**
 * Refuse la création/modification si (nom, catégorie) — comparaison du nom
 * insensible à la casse — coïncide déjà avec un autre modèle, actif ou
 * archivé. Le même nom dans une catégorie différente reste autorisé (ex.
 * "Classique" en ROBE et en ENSEMBLE).
 */
async function assertNoDuplicateNomCategorie(atelierId, nom, categorie, excludeId) {
  const existing = await prisma.modele.findFirst({
    where: {
      atelierId,
      nom: { equals: nom, mode: "insensitive" },
      categorie,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, nom: true, categorie: true, archivedAt: true },
  });
  if (existing) {
    throw new HttpError(409, "Un modèle avec ce nom existe déjà dans cette catégorie.", {
      modeleId: existing.id,
      nom: existing.nom,
      categorie: existing.categorie,
      archive: Boolean(existing.archivedAt),
    });
  }
}

// POST /api/modeles — création
router.post("/", async (req, res) => {
  const parsed = createModeleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const data = parsed.data;

  await assertNoDuplicateNomCategorie(req.user.atelierId, data.nom, data.categorie);

  const modele = await prisma.modele.create({ data: { ...data, atelierId: req.user.atelierId } });
  res.status(201).json(modele);
});

// GET /api/modeles — liste, recherche (nom/description), filtre catégorie et archivage, pagination
router.get("/", async (req, res) => {
  const parsed = listModelesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "Paramètres de recherche invalides.", formatZodError(parsed.error));
  }
  const { q, categorie, archived, page, pageSize } = parsed.data;

  const where = { atelierId: req.user.atelierId };
  // Par défaut : uniquement les modèles actifs. "archived=true" isole les
  // archivés, "archived=all" retire le filtre pour tout voir.
  if (archived === "false") where.archivedAt = null;
  else if (archived === "true") where.archivedAt = { not: null };

  if (categorie) where.categorie = categorie;

  if (q) {
    where.OR = [
      { nom: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.modele.findMany({
      where,
      // Tri déterministe : nom puis id en départage (deux modèles peuvent
      // légitimement partager un nom dans des catégories différentes).
      orderBy: [{ nom: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.modele.count({ where }),
  ]);

  res.json({
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});

// GET /api/modeles/:id — consultation (y compris archivé)
router.get("/:id", async (req, res) => {
  const modele = await prisma.modele.findFirst({ where: { id: req.params.id, atelierId: req.user.atelierId } });
  if (!modele) throw new HttpError(404, "Modèle introuvable.");
  res.json(modele);
});

// PATCH /api/modeles/:id — modification (interdite sur un modèle archivé)
router.patch("/:id", async (req, res) => {
  const parsed = updateModeleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const data = parsed.data;
  const { id } = req.params;

  const current = await prisma.modele.findFirst({
    where: { id, atelierId: req.user.atelierId },
    select: { nom: true, categorie: true, archivedAt: true },
  });
  if (!current) throw new HttpError(404, "Modèle introuvable.");
  if (current.archivedAt) {
    throw new HttpError(409, "Modèle archivé : restaurez-le avant de le modifier.");
  }

  if (data.nom !== undefined || data.categorie !== undefined) {
    const nom = data.nom ?? current.nom;
    const categorie = data.categorie ?? current.categorie;
    await assertNoDuplicateNomCategorie(req.user.atelierId, nom, categorie, id);
  }

  // updateMany avec condition sur archivedAt : garde-fou atomique contre un
  // archivage concurrent survenu entre la lecture ci-dessus et cette écriture.
  const result = await prisma.modele.updateMany({
    where: { id, atelierId: req.user.atelierId, archivedAt: null },
    data,
  });
  if (result.count === 0) {
    throw new HttpError(409, "Modèle archivé : restaurez-le avant de le modifier.");
  }

  const modele = await prisma.modele.findUnique({ where: { id } });
  res.json(modele);
});

// POST /api/modeles/:id/archiver — archivage (jamais de suppression physique)
router.post("/:id/archiver", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.modele.updateMany({
    where: { id, atelierId: req.user.atelierId, archivedAt: null },
    data: { archivedAt: new Date() },
  });

  if (result.count === 0) {
    const existing = await prisma.modele.findFirst({
      where: { id, atelierId: req.user.atelierId },
      select: { archivedAt: true },
    });
    if (!existing) throw new HttpError(404, "Modèle introuvable.");
    throw new HttpError(409, "Modèle déjà archivé.");
  }

  const modele = await prisma.modele.findUnique({ where: { id } });
  res.json(modele);
});

// POST /api/modeles/:id/restaurer — réactivation d'un modèle archivé
router.post("/:id/restaurer", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.modele.updateMany({
    where: { id, atelierId: req.user.atelierId, archivedAt: { not: null } },
    data: { archivedAt: null },
  });

  if (result.count === 0) {
    const existing = await prisma.modele.findFirst({
      where: { id, atelierId: req.user.atelierId },
      select: { archivedAt: true },
    });
    if (!existing) throw new HttpError(404, "Modèle introuvable.");
    throw new HttpError(409, "Modèle déjà actif.");
  }

  const modele = await prisma.modele.findUnique({ where: { id } });
  res.json(modele);
});

export default router;
