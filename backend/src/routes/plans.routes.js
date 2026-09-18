import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireSuperadmin } from "../middlewares/auth.middleware.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { formatZodError } from "../lib/validation.js";
import { creerPlanSchema, patchPlanSchema } from "../schemas/plan.schema.js";
import { planAvecTarifs } from "../lib/abonnement.js";

const router = Router();
router.use(requireAuth);
router.param("id", requireValidIdParam);

const ORDRE = [{ ordre: "asc" }, { prixMensuel: "asc" }];

// GET /api/plans-abonnement — plans ACTIFS, visibles de tout compte
// authentifié (le PDG consulte les formules sur sa page Abonnement). Aucune
// action de souscription n'existe côté atelier : voir abonnements.routes.js.
router.get("/", async (req, res) => {
  const plans = await prisma.planAbonnement.findMany({ where: { actif: true }, orderBy: ORDRE });
  res.json(plans.map(planAvecTarifs));
});

// GET /api/plans-abonnement/tous (SUPERADMIN) — y compris désactivés.
router.get("/tous", requireSuperadmin, async (req, res) => {
  const plans = await prisma.planAbonnement.findMany({ orderBy: ORDRE });
  res.json(plans.map(planAvecTarifs));
});

router.post("/", requireSuperadmin, async (req, res) => {
  const parsed = creerPlanSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const existant = await prisma.planAbonnement.findUnique({ where: { nom: parsed.data.nom } });
  if (existant) {
    throw new HttpError(409, "Un plan porte déjà ce nom.", { nom: ["Un plan porte déjà ce nom."] });
  }
  const plan = await prisma.planAbonnement.create({ data: parsed.data });
  res.status(201).json(planAvecTarifs(plan));
});

// PATCH /api/plans-abonnement/:id (SUPERADMIN) — un changement de prix ne
// s'applique qu'aux FUTURES activations : chaque Abonnement garde son propre
// prix/nom figés (voir Abonnement.planNom/prix, schema.prisma).
router.patch("/:id", requireSuperadmin, async (req, res) => {
  const parsed = patchPlanSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const plan = await prisma.planAbonnement.findUnique({ where: { id: req.params.id } });
  if (!plan) throw new HttpError(404, "Plan introuvable.");
  if (parsed.data.nom && parsed.data.nom !== plan.nom) {
    const doublon = await prisma.planAbonnement.findUnique({ where: { nom: parsed.data.nom } });
    if (doublon) throw new HttpError(409, "Un plan porte déjà ce nom.", { nom: ["Un plan porte déjà ce nom."] });
  }
  res.json(planAvecTarifs(await prisma.planAbonnement.update({ where: { id: plan.id }, data: parsed.data })));
});

export default router;
