import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAtelier } from "../middlewares/auth.middleware.js";
import { etatAbonnementAtelier, statutEffectif, joursRestants } from "../lib/abonnement.js";

const router = Router();
// L'abonnement est celui DE L'ATELIER (Phase 8). LECTURE SEULE : un ADMIN ne
// peut ni souscrire ni activer quoi que ce soit — l'activation est une action
// exclusive du SUPERADMIN (voir ateliersAbonnement.routes.js), et aucun
// paiement en ligne n'existe encore (lib/payments/ est dormant).
router.use(requireAuth, requireAtelier);

const ABONNEMENT_SELECT = {
  id: true,
  numero: true,
  statut: true,
  planNom: true,
  dureeMois: true,
  prix: true,
  dateDebut: true,
  dateExpiration: true,
  plan: { select: { id: true, nom: true } },
};

// GET /api/abonnements/etat — l'état à afficher sur la page Abonnement du PDG :
// ACTIF | EN_ATTENTE | ESSAI | EXPIRE | AUCUN, avec le plan et les dates de
// l'abonnement concerné et l'essai gratuit. Recalculé à chaque lecture depuis
// la base (le frontend interroge régulièrement) : tout changement fait par le
// SUPERADMIN est visible sans rechargement de page.
router.get("/etat", async (req, res) => {
  const [atelier, abonnements, plateforme] = await Promise.all([
    prisma.atelier.findUnique({ where: { id: req.user.atelierId }, select: { trialEndsAt: true } }),
    prisma.abonnement.findMany({ where: { atelierId: req.user.atelierId }, select: ABONNEMENT_SELECT }),
    prisma.parametresPlateforme.findUnique({ where: { id: "plateforme" } }),
  ]);
  const etat = etatAbonnementAtelier(atelier ?? { trialEndsAt: null }, abonnements);
  const a = etat.abonnement;
  res.json({
    statut: etat.statut,
    essai: etat.essai,
    // Contact WhatsApp de l'administrateur (réglé par le SUPERADMIN) — null si non configuré.
    contact: { whatsapp: plateforme?.contactWhatsapp ?? null },
    abonnement: a && {
      planNom: a.planNom ?? a.plan?.nom ?? null,
      dureeMois: a.dureeMois,
      prix: a.prix,
      dateDebut: a.dateDebut,
      dateExpiration: a.dateExpiration,
      statutEffectif: statutEffectif(a),
      joursRestants: a.dateExpiration && etat.statut === "ACTIF" ? joursRestants(a.dateExpiration) : null,
    },
  });
});

export default router;
