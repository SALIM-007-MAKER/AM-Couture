import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireAtelier, requireAbonnementActif } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { putParametresSchema, patchParametresSchema } from "../schemas/atelier.schema.js";
import { essaiExpire } from "../lib/trial.js";

// Phase 8 (multi-tenant) : Atelier n'est plus un singleton — chaque atelier
// a sa PROPRE ligne (voir ateliers.routes.js, créée au provisioning par le
// SUPERADMIN). Ce module gère les paramètres de L'ATELIER DE L'UTILISATEUR
// CONNECTÉ (req.user.atelierId), plus jamais un id fixe global.
const router = Router();

// requireAbonnementActif PAS appliqué ici globalement, contrairement aux
// autres modules métier : GET reste TOUJOURS accessible (§ trial/abonnement)
// — c'est via cette route que le logo/nom de l'atelier s'affichent dans la
// sidebar sur TOUTE page, y compris /abonnement une fois l'atelier bloqué ;
// la bloquer aurait fait échouer ce chargement en boucle sur la page même
// censée permettre de sortir du blocage. Seules les écritures (PUT/PATCH),
// une vraie fonctionnalité métier, restent gardées individuellement plus bas.
router.use(requireAuth, requireAtelier);

// GET /api/parametres — configuration actuelle, ou 404 si jamais configurée
// (cas résiduel : un atelier créé sans nom initial — ne devrait plus arriver
// via ateliers.routes.js, qui exige un nom à la création, mais reste géré
// proprement au cas où). `essaiExpire` ajouté à la réponse (jamais stocké,
// dérivé à la lecture) pour que le frontend puisse afficher l'état du trial
// sans dépendre d'un abonnement déjà créé.
router.get("/", async (req, res) => {
  const atelier = await prisma.atelier.findUnique({ where: { id: req.user.atelierId } });
  if (!atelier) throw new HttpError(404, "Paramètres de l'atelier non configurés.");
  res.json({ ...atelier, essaiExpire: essaiExpire(atelier) });
});

// PUT /api/parametres — crée la ligne si elle n'existe pas encore (nom +
// devise obligatoires), ou met à jour les champs fournis si elle existe déjà
// (voir atelier.schema.js : un champ optionnel omis n'efface jamais une
// valeur déjà en base, ni au create ni à l'update — Prisma ignore les clés
// `undefined` dans `data`).
router.put("/", requireAbonnementActif, async (req, res) => {
  const parsed = putParametresSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const atelier = await prisma.atelier.upsert({
    where: { id: req.user.atelierId },
    create: { id: req.user.atelierId, ...parsed.data },
    update: { ...parsed.data },
  });
  res.json(atelier);
});

// PATCH /api/parametres — modification partielle. Nécessite que la
// configuration existe déjà (contrairement à PUT, ne crée jamais la ligne) :
// 404 explicite sinon, avec message orientant vers PUT.
router.patch("/", requireAbonnementActif, async (req, res) => {
  const parsed = patchParametresSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  try {
    const atelier = await prisma.atelier.update({ where: { id: req.user.atelierId }, data: parsed.data });
    res.json(atelier);
  } catch (err) {
    if (err?.code === "P2025") {
      throw new HttpError(404, "Paramètres de l'atelier non configurés : utilisez PUT pour les créer d'abord.");
    }
    throw err;
  }
});

// Volontairement aucune route DELETE : l'atelier n'a pas de "mode non
// configuré" utile à retrouver après une première configuration — un champ
// se corrige via PUT/PATCH, pas en supprimant toute la configuration.

export default router;
