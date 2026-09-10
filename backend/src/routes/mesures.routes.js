import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { createMesureSchema, listMesuresQuerySchema } from "../schemas/mesure.schema.js";

// mergeParams: true — monté sous /api/clientes/:id/mesures, a besoin de
// req.params.id (la cliente). requireAuth est déjà appliqué par le routeur
// parent (clientes.routes.js) avant le montage : rien à refaire ici. :id est
// lui aussi déjà validé par le router.param du parent (mergeParams propage
// l'exécution des callbacks param déclarés sur le routeur qui a matché le
// segment). Seul :mesureId, propre à ce routeur, a besoin de sa déclaration.
const router = Router({ mergeParams: true });

router.param("mesureId", requireValidIdParam);

// Charge la cliente une seule fois pour toute la sous-arborescence /mesures.
// Une cliente inexistante -> 404 pour TOUTES les routes ci-dessous (liste,
// création, dernière, détail) : consulter des mesures suppose que la cliente
// existe.
router.use(async (req, res, next) => {
  const cliente = await prisma.cliente.findUnique({ where: { id: req.params.id } });
  if (!cliente) return next(new HttpError(404, "Client introuvable."));
  req.cliente = cliente;
  next();
});

// POST /api/clientes/:id/mesures — nouvelle prise de mesures.
// Principe non négociable : on crée TOUJOURS une nouvelle ligne, jamais de
// mise à jour d'une mesure existante (historique complet préservé).
router.post("/", async (req, res) => {
  if (req.cliente.archivedAt) {
    throw new HttpError(
      409,
      "Client archivé : restaurez-le avant d'enregistrer de nouvelles mesures.",
    );
  }

  const parsed = createMesureSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }

  // clienteId vient exclusivement du paramètre d'URL (la route imbriquée) —
  // le schéma n'accepte même pas ce champ dans le body (.strict()).
  const mesure = await prisma.mesure.create({
    data: { ...parsed.data, clienteId: req.cliente.id },
  });
  res.status(201).json(mesure);
});

// GET /api/clientes/:id/mesures — historique complet, plus récente en premier
router.get("/", async (req, res) => {
  const parsed = listMesuresQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  }
  const { page, pageSize } = parsed.data;

  const [data, total] = await Promise.all([
    prisma.mesure.findMany({
      where: { clienteId: req.cliente.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mesure.count({ where: { clienteId: req.cliente.id } }),
  ]);

  res.json({
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});

// GET /api/clientes/:id/mesures/derniere — dernière prise en date
// (déclarée avant "/:mesureId" pour ne pas être capturée comme un ID).
router.get("/derniere", async (req, res) => {
  const mesure = await prisma.mesure.findFirst({
    where: { clienteId: req.cliente.id },
    orderBy: { createdAt: "desc" },
  });
  if (!mesure) throw new HttpError(404, "Aucune mesure enregistrée pour ce client.");
  res.json(mesure);
});

// GET /api/clientes/:id/mesures/:mesureId — consultation d'une mesure précise
router.get("/:mesureId", async (req, res) => {
  const mesure = await prisma.mesure.findUnique({ where: { id: req.params.mesureId } });
  if (!mesure || mesure.clienteId !== req.cliente.id) {
    throw new HttpError(404, "Mesure introuvable.");
  }
  res.json(mesure);
});

export default router;
