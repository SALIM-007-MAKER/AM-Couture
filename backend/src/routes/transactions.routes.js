import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireAtelier } from "../middlewares/auth.middleware.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { activerAbonnement } from "../lib/abonnement.js";
import { getPaymentProvider, PAYMENTS_MOCK_ACTIF } from "../lib/payments/index.js";
import { simulerResultatSchema } from "../schemas/transaction.schema.js";
import { formatZodError } from "../lib/validation.js";

const router = Router();
// Transaction n'a pas sa propre atelierId (scopée via Abonnement) — chaque
// route ci-dessous vérifie explicitement transaction.abonnement.atelierId
// avant toute action (Phase 8 — multi-tenant, évite qu'un ADMIN confirme/
// rejette la transaction d'un AUTRE atelier).
router.use(requireAuth, requireAtelier);
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
  const transaction = await prisma.transaction.findFirst({
    where: { id: req.params.id, abonnement: { atelierId: req.user.atelierId } },
    include: { abonnement: { include: { formule: true } } },
  });
  if (!transaction) throw new HttpError(404, "Transaction introuvable.");
  if (transaction.moyenPaiement === "WAVE") {
    throw new HttpError(409, "Un paiement Wave ne peut être confirmé que via la vérification automatique.");
  }
  if (transaction.statut !== "EN_ATTENTE") {
    throw new HttpError(409, "Cette transaction n'est plus en attente.");
  }

  const transactionMaj = await prisma.$transaction(async (tx) => {
    const maj = await tx.transaction.update({
      where: { id: transaction.id },
      data: { statut: "REUSSIE", confirmeManuellement: true },
    });
    await activerAbonnement(tx, {
      abonnementId: transaction.abonnementId,
      dureeMois: transaction.abonnement.formule.dureeMois,
    });
    return maj;
  });

  res.json(transactionMaj);
});

// POST /api/transactions/:id/rejeter-manuel — la référence donnée par
// l'atelier ne correspond à aucun paiement reçu (ou paiement invalide) :
// clôt cette tentative sans jamais la modifier après coup (l'atelier
// recommence via un nouvel abonnement si besoin).
router.post("/:id/rejeter-manuel", async (req, res) => {
  const transaction = await prisma.transaction.findFirst({
    where: { id: req.params.id, abonnement: { atelierId: req.user.atelierId } },
  });
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

// GET /api/transactions/:id — détail minimal, utilisé par la page de
// simulation mock (PaiementTestPage.jsx) pour ré-afficher la transaction
// après un rafraîchissement (la réponse de création n'est gardée qu'en
// mémoire côté client).
router.get("/:id", async (req, res) => {
  const transaction = await prisma.transaction.findFirst({
    where: { id: req.params.id, abonnement: { atelierId: req.user.atelierId } },
    include: { abonnement: { include: { formule: { select: { nom: true, prix: true, dureeMois: true } } } } },
  });
  if (!transaction) throw new HttpError(404, "Transaction introuvable.");
  res.json(transaction);
});

// POST /api/transactions/:id/simuler-mock — UNIQUEMENT en mode test
// (PAYMENTS_MODE=mock, jamais en production, voir lib/payments/index.js).
// Simule le résultat qu'un vrai webhook/API du prestataire aurait produit —
// suit EXACTEMENT le même chemin d'activation que webhooks.routes.js
// (activerAbonnement), pour que le comportement observé en test soit fidèle
// à la production une fois les vraies clés API branchées. Réservée aux
// moyens à vérification automatique (WAVE aujourd'hui) : NITA/Amanata
// restent confirmables/rejetables uniquement via les routes manuelles
// ci-dessus, mock ou pas — déjà testables sans clé API, une simulation n'y
// ajouterait rien (voir NitaPaymentProvider/AmanataPaymentProvider).
router.post("/:id/simuler-mock", async (req, res) => {
  if (!PAYMENTS_MOCK_ACTIF) {
    throw new HttpError(404, "Route indisponible hors mode test (PAYMENTS_MODE=mock).");
  }
  const parsed = simulerResultatSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));

  const transaction = await prisma.transaction.findFirst({
    where: { id: req.params.id, abonnement: { atelierId: req.user.atelierId } },
    include: { abonnement: { include: { formule: true } } },
  });
  if (!transaction) throw new HttpError(404, "Transaction introuvable.");
  const provider = getPaymentProvider(transaction.moyenPaiement);
  if (!provider.verificationAutomatique) {
    throw new HttpError(409, "Ce moyen de paiement se confirme manuellement, pas par simulation.");
  }
  if (transaction.statut !== "EN_ATTENTE") {
    throw new HttpError(409, "Cette transaction n'est plus en attente.");
  }

  const { resultat } = parsed.data;
  const transactionMaj = await prisma.$transaction(async (tx) => {
    const maj = await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        statut: resultat,
        donneesBrutesWebhook: { mock: true, resultat, simulePar: req.user.id, at: new Date().toISOString() },
      },
    });
    if (resultat === "REUSSIE") {
      await activerAbonnement(tx, {
        abonnementId: transaction.abonnementId,
        dureeMois: transaction.abonnement.formule.dureeMois,
      });
    }
    return maj;
  });

  res.json(transactionMaj);
});

export default router;
