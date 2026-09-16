import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireAtelier, requireAbonnementActif } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import {
  createDepenseSchema,
  listDepensesQuerySchema,
  statsDepensesQuerySchema,
} from "../schemas/depense.schema.js";
import { annulerSchema } from "../schemas/annulation.schema.js";
import { buildCsv, envoyerCsv } from "../lib/csv.js";

const router = Router();

// Toutes les routes Dépenses exigent une session valide et un compte ADMIN
// rattaché à un atelier (Phase 8 — multi-tenant).
router.use(requireAuth, requireAtelier, requireAbonnementActif);

router.param("id", requireValidIdParam);

// Construit le "where" Prisma commun à la liste et aux statistiques.
function buildWhere(atelierId, { categorie, dateFrom, dateTo, q }) {
  const where = { atelierId };
  if (categorie) where.categorie = { equals: categorie, mode: "insensitive" };
  if (dateFrom || dateTo) {
    where.date = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      // Borne exclusive (voir dateRangeEndField) : inclut toute la journée
      // demandée sans dépendre d'un instant "23:59:59.999" arbitraire.
      ...(dateTo ? { lt: dateTo } : {}),
    };
  }
  if (q) {
    where.OR = [
      { categorie: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

// POST /api/depenses — création
router.post("/", async (req, res) => {
  const parsed = createDepenseSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const depense = await prisma.depense.create({ data: { ...parsed.data, atelierId: req.user.atelierId } });
  res.status(201).json(depense);
});

// GET /api/depenses/stats — agrégations calculées en base (jamais en JS)
// Déclarée AVANT /:id pour ne pas être capturée comme un identifiant.
router.get("/stats", async (req, res) => {
  const parsed = statsDepensesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  }
  // annuleAt: null uniquement ici (stats) — la LISTE (GET /depenses ci-
  // dessous) continue de tout renvoyer, annulées comprises, pour l'historique.
  const where = { ...buildWhere(req.user.atelierId, parsed.data), annuleAt: null };

  const [global, parCategorieBrut] = await Promise.all([
    prisma.depense.aggregate({ where, _sum: { montant: true }, _count: true }),
    prisma.depense.groupBy({
      by: ["categorie"],
      where,
      _sum: { montant: true },
      _count: true,
      orderBy: { categorie: "asc" },
    }),
  ]);

  const total = global._sum.montant ?? new Prisma.Decimal(0);
  const parCategorie = parCategorieBrut.map((ligne) => ({
    categorie: ligne.categorie,
    total: (ligne._sum.montant ?? new Prisma.Decimal(0)).toString(),
    nombre: ligne._count,
  }));

  res.json({ total: total.toString(), nombre: global._count, parCategorie });
});

// GET /api/depenses/export — export CSV, MÊMES filtres que GET / (et
// /stats) mais sans pagination — annulées comprises (voir GET / : l'export
// reflète la liste, pas les stats, qui elles excluent les annulées).
// Déclarée AVANT /:id pour ne pas être capturée comme un identifiant.
const LIMITE_EXPORT = 20_000;
router.get("/export", async (req, res) => {
  const parsed = listDepensesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "Paramètres de recherche invalides.", formatZodError(parsed.error));
  }
  const { page, pageSize, ...filtres } = parsed.data;
  const where = buildWhere(req.user.atelierId, filtres);

  const rows = await prisma.depense.findMany({
    where,
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: LIMITE_EXPORT,
  });

  const csv = buildCsv(rows, [
    { header: "Catégorie", accessor: "categorie" },
    { header: "Description", accessor: "description" },
    { header: "Montant", accessor: "montant" },
    { header: "Date", accessor: (d) => d.date.toISOString().slice(0, 10) },
    { header: "Justificatif", accessor: "justificatifUrl" },
    { header: "Statut", accessor: (d) => (d.annuleAt ? "Annulée" : "Active") },
    { header: "Motif d'annulation", accessor: "annuleMotif" },
  ]);
  envoyerCsv(res, `depenses-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});

// GET /api/depenses — liste, recherche, filtres, pagination
router.get("/", async (req, res) => {
  const parsed = listDepensesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "Paramètres de recherche invalides.", formatZodError(parsed.error));
  }
  const { page, pageSize, ...filtres } = parsed.data;
  const where = buildWhere(req.user.atelierId, filtres);

  const [data, total] = await Promise.all([
    prisma.depense.findMany({
      where,
      // Tri déterministe : date desc (plus récente en premier), id en
      // départage pour les dépenses saisies à la même date.
      orderBy: [{ date: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.depense.count({ where }),
  ]);

  res.json({
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});

// GET /api/depenses/:id — consultation
router.get("/:id", async (req, res) => {
  const depense = await prisma.depense.findFirst({ where: { id: req.params.id, atelierId: req.user.atelierId } });
  if (!depense) throw new HttpError(404, "Dépense introuvable.");
  res.json(depense);
});

// Toujours aucune route PATCH ni DELETE : une dépense reste un événement
// financier historique. Seule une ANNULATION LOGIQUE (ci-dessous) permet de
// corriger une erreur de saisie — la ligne d'origine n'est jamais modifiée.

// POST /api/depenses/:id/annuler — annulation logique d'une erreur de saisie.
router.post("/:id/annuler", async (req, res) => {
  const parsed = annulerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const { id } = req.params;

  const result = await prisma.depense.updateMany({
    where: { id, atelierId: req.user.atelierId, annuleAt: null },
    data: { annuleAt: new Date(), annuleMotif: parsed.data.motif },
  });

  if (result.count === 0) {
    const existing = await prisma.depense.findFirst({
      where: { id, atelierId: req.user.atelierId },
      select: { annuleAt: true },
    });
    if (!existing) throw new HttpError(404, "Dépense introuvable.");
    throw new HttpError(409, "Cette dépense est déjà annulée.");
  }

  const depense = await prisma.depense.findUnique({ where: { id } });
  res.json(depense);
});

export default router;
