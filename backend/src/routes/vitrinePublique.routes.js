import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { rateLimitPersistant } from "../lib/rateLimiter.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { formatZodError } from "../lib/validation.js";
import { stockage, decoderImage } from "../lib/stockageImages.js";
import { listVitrineQuerySchema } from "../schemas/vitrine.schema.js";

// ═══ Vitrine PUBLIQUE d'un atelier : lecture seule, sans compte ═══════════════════════════════════════════════════════
//
// Règle d'or : cette route ne renvoie QUE ce que le PDG a choisi de montrer. Chaque réponse est construite champ par
// champ à partir de listes blanches (jamais en étalant une ligne de base de données) : une colonne ajoutée plus tard au
// schéma ne devient jamais publique par accident. Tests : `vitrine-publique.test.js` fixe l'ensemble exact des clés.
//
// Ne sont jamais renvoyés : identifiant ou courriel de l'atelier, abonnement, clientes, commandes, paiements, stock,
// prix (de vente ou de revient), employés, modèles non publiés ou archivés, ni quoi que ce soit d'un atelier dont la
// vitrine est désactivée, suspendu ou inexistant (même 404 dans tous ces cas : aucune énumération possible).
const router = Router();
router.param("slug", (req, res, next, v) => (/^[a-z0-9-]{1,40}$/.test(v) ? next() : next(new HttpError(404, "Vitrine introuvable."))));
router.param("imageId", requireValidIdParam);

// 120 requêtes par minute et par IP sur les pages (une page de catalogue = 1 requête ; les images ne comptent pas).
const limite = rateLimitPersistant({ prefixe: "vitrine", limite: 120, fenetreMs: 60_000 });

const lectureAtelier = (slug) =>
  prisma.atelier.findFirst({
    where: { slug, vitrineActive: true, actif: true },
    select: {
      id: true,
      nom: true,
      slogan: true,
      logoUrl: true,
      vitrineDescription: true,
      couleurPrincipale: true,
      vitrineContact: true,
      telephone: true,
      adresse: true,
      ville: true,
      pays: true,
    },
  });

const publicQuiCache = (res) => res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

// GET /api/public/vitrines/:slug — présentation + catalogue publié (paginé, filtrable par catégorie, tag, recherche).
router.get("/vitrines/:slug", limite, async (req, res) => {
  const parsed = listVitrineQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { page, pageSize, q, categorie, tag } = parsed.data;
  const { slug } = req.params;

  const atelier = await lectureAtelier(slug);
  if (!atelier) throw new HttpError(404, "Vitrine introuvable.");

  const where = {
    atelierId: atelier.id,
    publie: true,
    archivedAt: null,
    ...(categorie ? { categorie } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
    ...(q ? { OR: [{ nom: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [modeles, total] = await Promise.all([
    prisma.modele.findMany({
      where,
      orderBy: [{ nom: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, nom: true, categorie: true, description: true, tags: true, photos: { orderBy: [{ ordre: "asc" }, { id: "asc" }], select: { imageId: true, legende: true } } },
    }),
    prisma.modele.count({ where }),
  ]);

  publicQuiCache(res);
  res.json({
    atelier: {
      nom: atelier.nom,
      slogan: atelier.slogan ?? null,
      description: atelier.vitrineDescription ?? null,
      couleur: atelier.couleurPrincipale ?? null,
      logo: atelier.logoUrl ? `/api/public/vitrines/${slug}/logo` : null,
      // Coordonnées : seulement si le PDG a choisi de les montrer.
      contact: atelier.vitrineContact
        ? { telephone: atelier.telephone ?? null, adresse: atelier.adresse ?? null, ville: atelier.ville ?? null, pays: atelier.pays ?? null }
        : null,
    },
    modeles: modeles.map((m) => ({
      id: m.id,
      nom: m.nom,
      categorie: m.categorie,
      description: m.description ?? null,
      tags: m.tags,
      photos: m.photos.map((p) => ({ url: `/api/public/vitrines/${slug}/images/${p.imageId}`, legende: p.legende ?? null })),
    })),
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});

// GET /api/public/vitrines/:slug/logo — le logo (stocké en data URL) rendu comme une vraie image.
router.get("/vitrines/:slug/logo", async (req, res) => {
  const atelier = await lectureAtelier(req.params.slug);
  const image = atelier?.logoUrl ? decoderImage(atelier.logoUrl) : null;
  if (!image) throw new HttpError(404, "Logo introuvable.");
  envoyerImage(res, image);
});

// GET /api/public/vitrines/:slug/images/:imageId — UNIQUEMENT une photo d'un modèle publié de CETTE vitrine active.
router.get("/vitrines/:slug/images/:imageId", async (req, res) => {
  const atelier = await lectureAtelier(req.params.slug);
  if (!atelier) throw new HttpError(404, "Image introuvable.");
  const photo = await prisma.photoModele.findFirst({
    where: { imageId: req.params.imageId, modele: { atelierId: atelier.id, publie: true, archivedAt: null } },
    select: { id: true },
  });
  const image = photo ? await stockage.lire(prisma, { id: req.params.imageId, atelierId: atelier.id }) : null;
  if (!image) throw new HttpError(404, "Image introuvable.");
  envoyerImage(res, image);
});

function envoyerImage(res, image) {
  res.setHeader("Content-Type", image.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "inline");
  // Courte durée : une photo dépubliée ne doit pas rester servie longtemps par les caches.
  res.setHeader("Cache-Control", "public, max-age=300");
  // La page publique est sur le même domaine, mais une image peut être ré-affichée ailleurs : autorisé pour une vitrine.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.send(image.octets);
}

export default router;
