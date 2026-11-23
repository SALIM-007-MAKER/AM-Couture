import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireSuperadmin } from "../middlewares/auth.middleware.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { formatZodError } from "../lib/validation.js";
import { creerPlanSchema, patchPlanSchema } from "../schemas/plan.schema.js";
import { planCatalogue, verifierActivation, estProposee } from "../lib/tarifs.js";
import { depassementsPourLimites } from "../lib/quotasServeur.js";

const router = Router();
router.use(requireAuth);

function exigerActivationPossible(plan) {
  const { ok, raisons } = verifierActivation(plan);
  if (!ok) {
    throw new HttpError(409, "Cette formule ne peut pas être activée : définissez d'abord ses tarifs et ses quotas.", { activation: raisons });
  }
}
router.param("id", requireValidIdParam);

const ORDRE = [{ ordre: "asc" }, { prixMensuel: { sort: "asc", nulls: "last" } }, { nom: "asc" }];

// GET /api/plans-abonnement — formules PROPOSÉES (actives ET avec au moins un prix configuré), visibles de tout compte
// authentifié (le PDG consulte les formules sur sa page « Abonnement et tarifs »). Une formule sans tarif, ou inactive, n'est jamais
// listée. Chaque formule porte ses `offres` (mensuelle / annuelle) et l'économie annuelle INFORMATIVE.
router.get("/", async (req, res) => {
  const plans = await prisma.planAbonnement.findMany({ where: { actif: true }, orderBy: ORDRE });
  res.json(plans.filter(estProposee).map(planCatalogue));
});

// GET /api/plans-abonnement/tous (SUPERADMIN) — y compris désactivés.
router.get("/tous", requireSuperadmin, async (req, res) => {
  const plans = await prisma.planAbonnement.findMany({ orderBy: ORDRE });
  res.json(plans.map(planCatalogue));
});

// GET /api/plans-abonnement/:id/depassements (SUPERADMIN) — ateliers dont l'usage actuel dépasse déjà les limites de cette
// formule. Aide à la décision, lecture seule : aucun atelier n'est modifié ni bloqué.
router.get("/:id/depassements", requireSuperadmin, async (req, res) => {
  const plan = await prisma.planAbonnement.findUnique({ where: { id: req.params.id } });
  if (!plan) throw new HttpError(404, "Plan introuvable.");
  res.json({ limites: plan.limites, ateliers: await depassementsPourLimites(prisma, plan.limites) });
});

// GET /api/plans-abonnement/:id/abonnes (SUPERADMIN) — ateliers actuellement abonnés à cette formule (abonnement ACTIF : confirmé et
// en cours), avec leur prix figé, leur période et leur revenu mensuel récurrent. Lecture seule ; ne dépend que de ce qui est figé
// dans les abonnements, jamais du catalogue courant.
router.get("/:id/abonnes", requireSuperadmin, async (req, res) => {
  const plan = await prisma.planAbonnement.findUnique({ where: { id: req.params.id }, select: { id: true, nom: true } });
  if (!plan) throw new HttpError(404, "Plan introuvable.");
  const maintenant = new Date();
  const abonnements = await prisma.abonnement.findMany({
    where: { planId: plan.id, statut: "CONFIRME", dateDebut: { lte: maintenant }, dateExpiration: { gt: maintenant } },
    select: {
      id: true,
      numero: true,
      prix: true,
      dureeMois: true,
      tarifExceptionnel: true,
      dateDebut: true,
      dateExpiration: true,
      atelier: { select: { id: true, nom: true } },
    },
    orderBy: { dateExpiration: "asc" },
  });
  const ateliers = abonnements.map((a) => ({
    atelier: a.atelier,
    abonnement: { id: a.id, numero: a.numero, prix: a.prix, dureeMois: a.dureeMois, tarifExceptionnel: a.tarifExceptionnel, dateDebut: a.dateDebut, dateExpiration: a.dateExpiration },
    revenuMensuel: a.dureeMois ? Math.round(Number(a.prix) / a.dureeMois) : null,
  }));
  const revenuMensuel = ateliers.reduce((somme, l) => somme + (l.revenuMensuel ?? 0), 0);
  res.json({ plan, nombre: ateliers.length, revenuMensuel, ateliers });
});

router.post("/", requireSuperadmin, async (req, res) => {
  const parsed = creerPlanSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const existant = await prisma.planAbonnement.findUnique({ where: { nom: parsed.data.nom } });
  if (existant) {
    throw new HttpError(409, "Un plan porte déjà ce nom.", { nom: ["Un plan porte déjà ce nom."] });
  }
  // Une formule ne peut être créée ACTIVE que si elle est commercialement complète (tarif et quotas définis).
  if (parsed.data.actif) exigerActivationPossible({ ...parsed.data });
  const plan = await prisma.planAbonnement.create({ data: parsed.data });
  res.status(201).json(planCatalogue(plan));
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
  // ACTIVATION commerciale (inactive -> active) : exige au moins un prix valide ET quatre quotas définis. Une formule déjà active
  // reste modifiable ; les formules antérieures aux quotas (limites vides) ne sont pas réévaluées tant qu'on ne les réactive pas.
  if (parsed.data.actif === true && !plan.actif) {
    exigerActivationPossible({ ...plan, ...parsed.data, limites: parsed.data.limites ?? plan.limites });
  }
  res.json(planCatalogue(await prisma.planAbonnement.update({ where: { id: plan.id }, data: parsed.data })));
});

export default router;
