import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireAtelier, requireAbonnementActif } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { verrouillerCle } from "../lib/verrous.js";
import {
  createModeleSchema,
  updateModeleSchema,
  listModelesQuerySchema,
} from "../schemas/modele.schema.js";

const router = Router();

// Toutes les routes Modèles exigent une session valide et un compte ADMIN
// rattaché à un atelier (Phase 8 — multi-tenant).
router.use(requireAuth, requireAtelier, requireAbonnementActif);

// Rétro-portage du garde-fou anti-octet-nul/caractères de contrôle — voir
// clientes.routes.js pour le contexte complet (point ouvert depuis le module 5).
router.param("id", requireValidIdParam);

/**
 * Refuse la création/modification si (nom, catégorie) — comparaison du nom
 * insensible à la casse — coïncide déjà avec un autre modèle, actif ou
 * archivé. Le même nom dans une catégorie différente reste autorisé (ex.
 * "Classique" en ROBE et en ENSEMBLE).
 */
// Clé du verrou consultatif : atelier + catégorie + nom en minuscules (comparaison insensible à la casse,
// comme la vérification ci-dessous). Le nom est déjà normalisé (espaces) par le schéma de validation.
const cleModele = (atelierId, categorie, nom) =>
  `modele:${atelierId}:${categorie}:${String(nom).trim().replace(/\s+/g, " ").toLowerCase()}`;

async function assertNoDuplicateNomCategorie(client, atelierId, nom, categorie, excludeId) {
  const existing = await client.modele.findFirst({
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

  // Vérification ET création dans une même transaction, sous verrou consultatif (anomalie 6 : 6 modèles
  // créés sur 8 requêtes simultanées avant correction).
  const modele = await prisma.$transaction(
    async (tx) => {
      await verrouillerCle(tx, cleModele(req.user.atelierId, data.categorie, data.nom));
      await assertNoDuplicateNomCategorie(tx, req.user.atelierId, data.nom, data.categorie);
      return tx.modele.create({ data: { ...data, atelierId: req.user.atelierId } });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
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

  // updateMany avec condition sur archivedAt : garde-fou atomique contre un
  // archivage concurrent survenu entre la lecture ci-dessus et cette écriture.
  const result = await prisma.$transaction(
    async (tx) => {
      if (data.nom !== undefined || data.categorie !== undefined) {
        const nom = data.nom ?? current.nom;
        const categorie = data.categorie ?? current.categorie;
        await verrouillerCle(tx, cleModele(req.user.atelierId, categorie, nom));
        await assertNoDuplicateNomCategorie(tx, req.user.atelierId, nom, categorie, id);
      }
      return tx.modele.updateMany({
        where: { id, atelierId: req.user.atelierId, archivedAt: null },
        data,
      });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
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
