import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireMembreAtelier, requireAbonnementActif, droitsParModule } from "../middlewares/auth.middleware.js";
import { masquerFinancesSiNonAutorise } from "../lib/masquageFinances.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { verrouillerCle } from "../lib/verrous.js";
import { stockage, decoderImage } from "../lib/stockageImages.js";
import {
  createModeleSchema,
  updateModeleSchema,
  listModelesQuerySchema,
  createPhotoModeleSchema,
  ordrePhotosSchema,
  MAX_PHOTOS_MODELE,
} from "../schemas/modele.schema.js";

const router = Router();

// Toutes les routes Modèles exigent une session valide et un compte ADMIN
// rattaché à un atelier (Phase 8 — multi-tenant).
// Membres de l'atelier (PDG ou employé) ; l'employé doit en plus avoir la permission « modeles.lire » (GET) ou
// « modeles.ecrire » (autres méthodes), contrôlée avant toute route.
router.use(requireAuth, requireMembreAtelier, requireAbonnementActif, droitsParModule("modeles"), masquerFinancesSiNonAutorise);

// Rétro-portage du garde-fou anti-octet-nul/caractères de contrôle — voir
// clientes.routes.js pour le contexte complet (point ouvert depuis le module 5).
router.param("id", requireValidIdParam);
router.param("photoId", requireValidIdParam);

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
  const modele = await prisma.modele.findFirst({
    where: { id: req.params.id, atelierId: req.user.atelierId },
    include: { photos: { orderBy: [{ ordre: "asc" }, { id: "asc" }], select: { id: true, ordre: true, legende: true, imageId: true } } },
  });
  if (!modele) throw new HttpError(404, "Modèle introuvable.");
  res.json({ ...modele, photos: modele.photos.map((p) => ({ ...p, url: `/api/images/${p.imageId}` })) });
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

  // Publier suppose d'avoir quelque chose à montrer : au moins une photo (lookbook ou photo historique).
  if (data.publie === true) {
    const photos = await prisma.photoModele.count({ where: { modeleId: id } });
    const historique = await prisma.modele.findFirst({ where: { id }, select: { photoUrl: true } });
    if (photos === 0 && !historique?.photoUrl && !data.photoUrl) {
      throw new HttpError(409, "Ajoutez au moins une photo avant de publier ce modèle.");
    }
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
    // Un modèle archivé n'est plus montré : l'archivage retire aussi la publication.
    data: { archivedAt: new Date(), publie: false },
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

// ── Lookbook (7.1) : photos d'un modèle ────────────────────────────────────────────────────────────────────────────

const PHOTOS_SELECT = { id: true, ordre: true, legende: true, imageId: true };
const presenterPhoto = (p) => ({ ...p, url: `/api/images/${p.imageId}` });

// POST /api/modeles/:id/photos — ajoute une photo (fichier) à la fin ; 8 photos au plus par modèle.
router.post("/:id/photos", async (req, res) => {
  const parsed = createPhotoModeleSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const { id } = req.params;
  const { atelierId } = req.user;
  const decodee = decoderImage(parsed.data.image);
  if (!decodee) throw new HttpError(400, "Champs invalides.", { image: ["Le fichier n'est pas une image valide."] });

  const photo = await prisma.$transaction(
    async (tx) => {
      // Verrou sur le modèle : deux ajouts simultanés ne dépassent pas la limite et gardent des positions distinctes.
      const verrou = await tx.$queryRaw`SELECT id FROM "Modele" WHERE id = ${id} AND "atelierId" = ${atelierId} FOR UPDATE`;
      if (verrou.length === 0) throw new HttpError(404, "Modèle introuvable.");
      const modele = await tx.modele.findUnique({ where: { id }, select: { archivedAt: true } });
      if (modele.archivedAt) throw new HttpError(409, "Modèle archivé : restaurez-le avant d'ajouter une photo.");
      const existantes = await tx.photoModele.aggregate({ where: { modeleId: id }, _count: true, _max: { ordre: true } });
      if (existantes._count >= MAX_PHOTOS_MODELE) {
        throw new HttpError(409, `Un modèle ne peut pas avoir plus de ${MAX_PHOTOS_MODELE} photos.`, { maximum: MAX_PHOTOS_MODELE });
      }
      const { id: imageId } = await stockage.enregistrer(tx, { atelierId, mime: decodee.mime, octets: decodee.octets });
      return tx.photoModele.create({
        data: { modeleId: id, imageId, ordre: (existantes._max.ordre ?? -1) + 1, legende: parsed.data.legende },
        select: PHOTOS_SELECT,
      });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  res.status(201).json(presenterPhoto(photo));
});

// DELETE /api/modeles/:id/photos/:photoId — retire la photo ET son image ; si c'était la dernière d'un modèle publié
// (sans photo historique), le modèle est dépublié (jamais de modèle publié sans image).
router.delete("/:id/photos/:photoId", async (req, res) => {
  const { id, photoId } = req.params;
  const { atelierId } = req.user;
  await prisma.$transaction(
    async (tx) => {
      const verrou = await tx.$queryRaw`SELECT id FROM "Modele" WHERE id = ${id} AND "atelierId" = ${atelierId} FOR UPDATE`;
      if (verrou.length === 0) throw new HttpError(404, "Modèle introuvable.");
      const photo = await tx.photoModele.findFirst({ where: { id: photoId, modeleId: id }, select: { id: true, imageId: true } });
      if (!photo) throw new HttpError(404, "Photo introuvable.");
      await tx.photoModele.delete({ where: { id: photo.id } });
      await stockage.supprimer(tx, { id: photo.imageId, atelierId });
      const reste = await tx.photoModele.count({ where: { modeleId: id } });
      const modele = await tx.modele.findUnique({ where: { id }, select: { photoUrl: true } });
      if (reste === 0 && !modele.photoUrl) await tx.modele.update({ where: { id }, data: { publie: false } });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  res.status(204).end();
});

// PUT /api/modeles/:id/photos/ordre — { ids: [...] } : nouvel ordre (la première est la couverture). La liste doit
// contenir exactement les photos du modèle.
router.put("/:id/photos/ordre", async (req, res) => {
  const parsed = ordrePhotosSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const { id } = req.params;
  const { atelierId } = req.user;
  const photos = await prisma.$transaction(
    async (tx) => {
      const verrou = await tx.$queryRaw`SELECT id FROM "Modele" WHERE id = ${id} AND "atelierId" = ${atelierId} FOR UPDATE`;
      if (verrou.length === 0) throw new HttpError(404, "Modèle introuvable.");
      const actuelles = await tx.photoModele.findMany({ where: { modeleId: id }, select: { id: true } });
      const demandees = parsed.data.ids;
      const memes = demandees.length === actuelles.length && new Set(demandees).size === demandees.length && actuelles.every((p) => demandees.includes(p.id));
      if (!memes) throw new HttpError(400, "La liste doit contenir exactement les photos du modèle, une fois chacune.");
      for (const [ordre, photoId] of demandees.entries()) await tx.photoModele.update({ where: { id: photoId }, data: { ordre } });
      return tx.photoModele.findMany({ where: { modeleId: id }, orderBy: { ordre: "asc" }, select: PHOTOS_SELECT });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  res.json(photos.map(presenterPhoto));
});

export default router;
