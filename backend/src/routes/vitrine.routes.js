import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireAtelier, requireAbonnementActif } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { patchVitrineSchema } from "../schemas/vitrine.schema.js";

const router = Router();

// Réglages de la vitrine publique : réservés au PDG (administration, non délégable, comme les paramètres de l'atelier).
router.use(requireAuth, requireAtelier);

const SELECT = { slug: true, vitrineActive: true, vitrineDescription: true, couleurPrincipale: true, vitrineContact: true, demandesEnLigne: true };

router.get("/", async (req, res) => {
  const atelier = await prisma.atelier.findUnique({ where: { id: req.user.atelierId }, select: SELECT });
  const publies = await prisma.modele.count({ where: { atelierId: req.user.atelierId, publie: true, archivedAt: null } });
  res.json({ ...atelier, modelesPublies: publies });
});

// PATCH /api/vitrine — activer exige un identifiant ; l'identifiant est unique sur la plateforme (409 sinon).
router.patch("/", requireAbonnementActif, async (req, res) => {
  const parsed = patchVitrineSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const data = parsed.data;
  const { atelierId } = req.user;

  const actuel = await prisma.atelier.findUnique({ where: { id: atelierId }, select: { slug: true } });
  const slugFinal = data.slug ?? actuel.slug;
  if (data.vitrineActive === true && !slugFinal) {
    throw new HttpError(400, "Champs invalides.", { slug: ["Choisissez un identifiant avant d'activer la vitrine."] });
  }
  if (data.demandesEnLigne === true && data.vitrineActive !== true && !(await prisma.atelier.findUnique({ where: { id: atelierId }, select: { vitrineActive: true } })).vitrineActive) {
    throw new HttpError(400, "Champs invalides.", { demandesEnLigne: ["Activez la vitrine pour recevoir des demandes en ligne."] });
  }

  try {
    const atelier = await prisma.atelier.update({ where: { id: atelierId }, data, select: SELECT });
    res.json(atelier);
  } catch (err) {
    if (err?.code === "P2002") throw new HttpError(409, "Cet identifiant est déjà utilisé par un autre atelier.", { slug: ["Identifiant déjà pris."] });
    throw err;
  }
});

export default router;
