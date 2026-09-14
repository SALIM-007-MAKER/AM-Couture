import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireSuperadmin } from "../middlewares/auth.middleware.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { formatZodError } from "../lib/validation.js";
import { creerFormuleSchema, patchFormuleSchema } from "../schemas/formuleAbonnement.schema.js";

const router = Router();
router.use(requireAuth);
router.param("id", requireValidIdParam);

// GET /api/formules-abonnement — formules actives, triées par durée
// croissante. Accessible à tout compte authentifié (ADMIN choisissant sa
// formule à l'abonnement) — pas de requireAtelier : un SUPERADMIN peut aussi
// les consulter (page de gestion, voir routes ci-dessous).
router.get("/", async (req, res) => {
  const formules = await prisma.formuleAbonnement.findMany({
    where: { actif: true },
    orderBy: { dureeMois: "asc" },
  });
  res.json(formules);
});

// GET /api/formules-abonnement/toutes (SUPERADMIN) — y compris inactives,
// pour l'écran de gestion des tarifs. Définie avant PATCH /:id : chemin
// distinct, aucun risque de collision avec un :id, mais gardé groupé avec
// les autres routes SUPERADMIN pour la lisibilité.
router.get("/toutes", requireSuperadmin, async (req, res) => {
  const formules = await prisma.formuleAbonnement.findMany({ orderBy: { dureeMois: "asc" } });
  res.json(formules);
});

// POST /api/formules-abonnement (SUPERADMIN) — nouvelle formule. dureeMois
// doit être unique (contrainte Prisma) — un doublon renvoie un 409 lisible
// plutôt que l'erreur Prisma brute.
router.post("/", requireSuperadmin, async (req, res) => {
  const parsed = creerFormuleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const existante = await prisma.formuleAbonnement.findUnique({ where: { dureeMois: parsed.data.dureeMois } });
  if (existante) {
    throw new HttpError(409, "Une formule existe déjà pour cette durée.", {
      dureeMois: ["Une formule existe déjà pour cette durée."],
    });
  }
  const formule = await prisma.formuleAbonnement.create({ data: parsed.data });
  res.status(201).json(formule);
});

// PATCH /api/formules-abonnement/:id (SUPERADMIN) — nom/prix/actif. Le prix
// modifié ici ne s'applique qu'aux FUTURS abonnements : chaque Abonnement
// déjà souscrit garde son propre `prix` figé au moment de la souscription
// (voir schema.prisma, commentaire sur Abonnement.prix) — jamais recalculé
// rétroactivement.
router.patch("/:id", requireSuperadmin, async (req, res) => {
  const parsed = patchFormuleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const existante = await prisma.formuleAbonnement.findUnique({ where: { id: req.params.id } });
  if (!existante) throw new HttpError(404, "Formule introuvable.");
  const formule = await prisma.formuleAbonnement.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(formule);
});

export default router;
