import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireMembreAtelier, requireAbonnementActif, requirePermission } from "../middlewares/auth.middleware.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { stockage } from "../lib/stockageImages.js";

const router = Router();

// Images du lookbook, côté ATELIER : réservées aux membres de l'atelier qui peuvent consulter les modèles. Toujours
// bornées à l'atelier du compte (un identifiant d'une autre atelier répond 404, jamais l'image). La diffusion
// publique des photos publiées est un chantier séparé (vitrine, 7.2), avec sa propre route et sa liste blanche.
router.use(requireAuth, requireMembreAtelier, requireAbonnementActif, requirePermission("modeles.lire"));
router.param("id", requireValidIdParam);

router.get("/:id", async (req, res) => {
  const image = await stockage.lire(prisma, { id: req.params.id, atelierId: req.user.atelierId });
  if (!image) throw new HttpError(404, "Image introuvable.");
  res.setHeader("Content-Type", image.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "inline");
  // L'identifiant ne désigne jamais deux contenus : mise en cache longue, mais jamais partagée (route privée).
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.send(image.octets);
});

export default router;
