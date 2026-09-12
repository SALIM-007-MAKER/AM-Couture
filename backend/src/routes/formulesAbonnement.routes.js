import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

// Lecture seule — les prix se modifient directement dans la table
// FormuleAbonnement (voir schema.prisma), pas via une route de ce fichier
// pour l'instant (aucun écran d'édition demandé dans cette phase).
const router = Router();
router.use(requireAuth);

// GET /api/formules-abonnement — formules actives, triées par durée croissante.
router.get("/", async (req, res) => {
  const formules = await prisma.formuleAbonnement.findMany({
    where: { actif: true },
    orderBy: { dureeMois: "asc" },
  });
  res.json(formules);
});

export default router;
