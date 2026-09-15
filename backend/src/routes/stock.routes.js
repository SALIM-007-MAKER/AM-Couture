import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireAtelier } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { quantiteArticle, quantitesArticles } from "../lib/stock.js";
import { buildCsv, envoyerCsv } from "../lib/csv.js";
import {
  createArticleStockSchema,
  updateArticleStockSchema,
  listArticlesStockQuerySchema,
  createMouvementStockSchema,
  listMouvementsQuerySchema,
} from "../schemas/articleStock.schema.js";

const router = Router();

// Toutes les routes Stock exigent une session valide et un compte ADMIN
// rattaché à un atelier (Phase 8 — multi-tenant).
router.use(requireAuth, requireAtelier);

router.param("id", requireValidIdParam);

function buildArticlesStockWhere(atelierId, { q, categorie, archived }) {
  const where = { atelierId };
  if (archived === "false") where.archivedAt = null;
  else if (archived === "true") where.archivedAt = { not: null };
  if (categorie) where.categorie = { equals: categorie, mode: "insensitive" };
  if (q) {
    where.OR = [
      { nom: { contains: q, mode: "insensitive" } },
      { categorie: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

// POST /api/stock — création d'un article. `quantiteInitiale` (optionnelle)
// matérialise un premier mouvement ENTREE dans la même transaction — jamais
// un champ quantite écrit directement sur ArticleStock (voir lib/stock.js).
router.post("/", async (req, res) => {
  const parsed = createArticleStockSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const { quantiteInitiale, ...data } = parsed.data;

  const article = await prisma.$transaction(async (tx) => {
    const created = await tx.articleStock.create({ data: { ...data, atelierId: req.user.atelierId } });
    if (quantiteInitiale) {
      await tx.mouvementStock.create({
        data: { articleId: created.id, type: "ENTREE", quantite: quantiteInitiale, motif: "Stock initial" },
      });
    }
    return created;
  });

  const quantite = await quantiteArticle(prisma, article.id);
  res.status(201).json({ ...article, quantite: quantite.toString() });
});

// GET /api/stock — liste, recherche (nom/catégorie), filtre catégorie et
// archivage, pagination. Quantités calculées en UNE requête groupée pour
// toute la page (pas un aggregate par ligne — voir quantitesArticles).
router.get("/", async (req, res) => {
  const parsed = listArticlesStockQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres de recherche invalides.", formatZodError(parsed.error));
  const { page, pageSize, ...filtres } = parsed.data;
  const where = buildArticlesStockWhere(req.user.atelierId, filtres);

  const [rows, total] = await Promise.all([
    prisma.articleStock.findMany({
      where,
      orderBy: [{ nom: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.articleStock.count({ where }),
  ]);

  const quantites = await quantitesArticles(
    prisma,
    rows.map((r) => r.id),
  );
  const data = rows.map((r) => ({ ...r, quantite: quantites.get(r.id).toString() }));

  res.json({ data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});

// GET /api/stock/alertes — articles actifs dont la quantité est ≤ à leur
// seuil d'alerte (seuilAlerte non défini = jamais alerté). Pas de
// pagination : le nombre d'articles réellement en alerte reste faible par
// nature. Déclarée AVANT /:id (route-ordering — voir commentaire
// équivalent dans ateliers.routes.js).
router.get("/alertes", async (req, res) => {
  const articles = await prisma.articleStock.findMany({
    where: { atelierId: req.user.atelierId, archivedAt: null, seuilAlerte: { not: null } },
    orderBy: [{ nom: "asc" }],
  });
  const quantites = await quantitesArticles(
    prisma,
    articles.map((a) => a.id),
  );
  const data = articles
    .map((a) => ({ ...a, quantiteDec: quantites.get(a.id) }))
    .filter((a) => a.quantiteDec.lessThanOrEqualTo(a.seuilAlerte))
    .map(({ quantiteDec, ...a }) => ({ ...a, quantite: quantiteDec.toString() }));
  res.json({ data });
});

// GET /api/stock/export — export CSV, MÊMES filtres que GET / mais sans
// pagination. Déclarée AVANT /:id.
const LIMITE_EXPORT = 20_000;
router.get("/export", async (req, res) => {
  const parsed = listArticlesStockQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres de recherche invalides.", formatZodError(parsed.error));
  const where = buildArticlesStockWhere(req.user.atelierId, parsed.data);

  const rows = await prisma.articleStock.findMany({
    where,
    orderBy: [{ nom: "asc" }, { id: "asc" }],
    take: LIMITE_EXPORT,
  });
  const quantites = await quantitesArticles(
    prisma,
    rows.map((r) => r.id),
  );

  const csv = buildCsv(rows, [
    { header: "Nom", accessor: "nom" },
    { header: "Catégorie", accessor: "categorie" },
    { header: "Unité", accessor: "unite" },
    { header: "Quantité", accessor: (a) => quantites.get(a.id).toString() },
    { header: "Seuil d'alerte", accessor: "seuilAlerte" },
    { header: "Prix unitaire", accessor: "prixUnitaire" },
    { header: "Statut", accessor: (a) => (a.archivedAt ? "Archivé" : "Actif") },
  ]);
  envoyerCsv(res, `stock-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});

// GET /api/stock/:id — consultation (y compris archivé)
router.get("/:id", async (req, res) => {
  const article = await prisma.articleStock.findFirst({ where: { id: req.params.id, atelierId: req.user.atelierId } });
  if (!article) throw new HttpError(404, "Article introuvable.");
  const quantite = await quantiteArticle(prisma, article.id);
  res.json({ ...article, quantite: quantite.toString() });
});

// PATCH /api/stock/:id — modification (jamais la quantité, toujours dérivée
// des mouvements — voir POST .../mouvements). Interdite sur un article archivé.
router.patch("/:id", async (req, res) => {
  const parsed = updateArticleStockSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const { id } = req.params;

  // updateMany avec condition sur archivedAt : garde-fou atomique contre un
  // archivage concurrent (voir modeles.routes.js).
  const result = await prisma.articleStock.updateMany({
    where: { id, atelierId: req.user.atelierId, archivedAt: null },
    data: parsed.data,
  });
  if (result.count === 0) {
    const existing = await prisma.articleStock.findFirst({
      where: { id, atelierId: req.user.atelierId },
      select: { archivedAt: true },
    });
    if (!existing) throw new HttpError(404, "Article introuvable.");
    throw new HttpError(409, "Article archivé : restaurez-le avant de le modifier.");
  }

  const article = await prisma.articleStock.findUnique({ where: { id } });
  const quantite = await quantiteArticle(prisma, id);
  res.json({ ...article, quantite: quantite.toString() });
});

// POST /api/stock/:id/archiver — archivage (jamais de suppression physique)
router.post("/:id/archiver", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.articleStock.updateMany({
    where: { id, atelierId: req.user.atelierId, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    const existing = await prisma.articleStock.findFirst({
      where: { id, atelierId: req.user.atelierId },
      select: { archivedAt: true },
    });
    if (!existing) throw new HttpError(404, "Article introuvable.");
    throw new HttpError(409, "Article déjà archivé.");
  }
  const article = await prisma.articleStock.findUnique({ where: { id } });
  const quantite = await quantiteArticle(prisma, id);
  res.json({ ...article, quantite: quantite.toString() });
});

// POST /api/stock/:id/restaurer — réactivation d'un article archivé
router.post("/:id/restaurer", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.articleStock.updateMany({
    where: { id, atelierId: req.user.atelierId, archivedAt: { not: null } },
    data: { archivedAt: null },
  });
  if (result.count === 0) {
    const existing = await prisma.articleStock.findFirst({
      where: { id, atelierId: req.user.atelierId },
      select: { archivedAt: true },
    });
    if (!existing) throw new HttpError(404, "Article introuvable.");
    throw new HttpError(409, "Article déjà actif.");
  }
  const article = await prisma.articleStock.findUnique({ where: { id } });
  const quantite = await quantiteArticle(prisma, id);
  res.json({ ...article, quantite: quantite.toString() });
});

// GET /api/stock/:id/mouvements — historique paginé des entrées/sorties.
router.get("/:id/mouvements", async (req, res) => {
  const parsed = listMouvementsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { page, pageSize } = parsed.data;
  const { id: articleId } = req.params;

  const article = await prisma.articleStock.findFirst({
    where: { id: articleId, atelierId: req.user.atelierId },
    select: { id: true },
  });
  if (!article) throw new HttpError(404, "Article introuvable.");

  const where = { articleId };
  const [data, total] = await Promise.all([
    prisma.mouvementStock.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mouvementStock.count({ where }),
  ]);

  res.json({ data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});

// POST /api/stock/:id/mouvements — enregistre une entrée ou une sortie.
// Protégé contre la concurrence exactement comme la création d'un Paiement
// (voir paiements.routes.js) : verrou SELECT ... FOR UPDATE sur la ligne
// ArticleStock pour toute la transaction, bien que la quantité soit agrégée
// depuis MouvementStock (table enfant) — sérialise les mouvements
// concurrents sur LE MÊME article, empêchant une SORTIE de faire passer le
// stock sous zéro même sous charge.
router.post("/:id/mouvements", async (req, res) => {
  const parsed = createMouvementStockSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const { type, quantite, motif } = parsed.data;
  const { id: articleId } = req.params;

  const mouvement = await prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw`SELECT id FROM "ArticleStock" WHERE id = ${articleId} FOR UPDATE`;
      if (locked.length === 0) throw new HttpError(404, "Article introuvable.");

      const article = await tx.articleStock.findFirst({ where: { id: articleId, atelierId: req.user.atelierId } });
      if (!article) throw new HttpError(404, "Article introuvable.");
      if (article.archivedAt) {
        throw new HttpError(409, "Article archivé : restaurez-le avant d'enregistrer un mouvement.");
      }

      if (type === "SORTIE") {
        const quantiteActuelle = await quantiteArticle(tx, articleId);
        const quantiteSortie = new Prisma.Decimal(quantite);
        if (quantiteSortie.greaterThan(quantiteActuelle)) {
          throw new HttpError(409, "Quantité insuffisante en stock.", {
            quantiteDisponible: quantiteActuelle.toString(),
            quantiteDemandee: quantite,
          });
        }
      }

      return tx.mouvementStock.create({ data: { articleId, type, quantite, motif } });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );

  const quantiteApres = await quantiteArticle(prisma, articleId);
  res.status(201).json({ ...mouvement, quantiteApres: quantiteApres.toString() });
});

export default router;
