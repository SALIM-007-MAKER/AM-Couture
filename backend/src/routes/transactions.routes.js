import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { calculerDateExpiration } from "../lib/abonnement.js";

const router = Router();
router.use(requireAuth);
router.param("id", requireValidIdParam);

// POST /api/transactions/:id/confirmer-manuel — UNIQUEMENT pour NITA/AMANA
// (voir audit Phase 6 : aucune API exploitable pour vérifier ces paiements
// automatiquement aujourd'hui). Action EXPLICITE de l'admin, qui atteste
// avoir vérifié lui-même la réception du paiement sur son propre compte
// NITA/Amana — jamais déclenchée automatiquement, et jamais pour WAVE (qui
// passe exclusivement par le webhook signé + relecture serveur, voir
// webhooks.routes.js). confirmeManuellement=true reste visible partout où
// cette transaction est affichée, pour ne jamais la confondre avec une
// vérification automatique.
router.post("/:id/confirmer-manuel", async (req, res) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id: req.params.id },
    include: { abonnement: { include: { formule: true } } },
  });
  if (!transaction) throw new HttpError(404, "Transaction introuvable.");
  if (transaction.moyenPaiement === "WAVE") {
    throw new HttpError(409, "Un paiement Wave ne peut être confirmé que via la vérification automatique.");
  }
  if (transaction.statut !== "EN_ATTENTE") {
    throw new HttpError(409, "Cette transaction n'est plus en attente.");
  }

  const maintenant = new Date();
  const dateExpiration = calculerDateExpiration(maintenant, transaction.abonnement.formule.dureeMois);

  const [transactionMaj] = await prisma.$transaction([
    prisma.transaction.update({
      where: { id: transaction.id },
      data: { statut: "REUSSIE", confirmeManuellement: true },
    }),
    prisma.abonnement.update({
      where: { id: transaction.abonnementId },
      data: { statut: "CONFIRME", dateDebut: maintenant, dateExpiration },
    }),
  ]);

  res.json(transactionMaj);
});

// POST /api/transactions/:id/rejeter-manuel — la référence donnée par
// l'atelier ne correspond à aucun paiement reçu (ou paiement invalide) :
// clôt cette tentative sans jamais la modifier après coup (l'atelier
// recommence via un nouvel abonnement si besoin).
router.post("/:id/rejeter-manuel", async (req, res) => {
  const transaction = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!transaction) throw new HttpError(404, "Transaction introuvable.");
  if (transaction.moyenPaiement === "WAVE") {
    throw new HttpError(409, "Un paiement Wave ne se rejette pas manuellement.");
  }
  if (transaction.statut !== "EN_ATTENTE") {
    throw new HttpError(409, "Cette transaction n'est plus en attente.");
  }
  const updated = await prisma.transaction.update({ where: { id: transaction.id }, data: { statut: "ECHOUEE" } });
  res.json(updated);
});

export default router;
