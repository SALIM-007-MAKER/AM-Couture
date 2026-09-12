import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { verifierSignatureWebhook, recupererSession } from "../lib/wave.js";
import { calculerDateExpiration } from "../lib/abonnement.js";

// PAS de requireAuth sur ce routeur : Wave appelle cette route directement,
// sans cookie de session. La confiance vient EXCLUSIVEMENT de la signature
// HMAC (voir lib/wave.js) — jamais d'exception "on fait confiance quand
// même" si le secret n'est pas configuré ou si la signature ne correspond
// pas.
const router = Router();

// POST /api/webhooks/wave — voir docs.wave.com (checkout.session.completed).
router.post("/wave", async (req, res) => {
  const secret = process.env.WAVE_WEBHOOK_SECRET;
  if (!secret) {
    // Aucun secret configuré : impossible de vérifier quoi que ce soit —
    // on refuse, jamais de confirmation "en confiance" en son absence.
    return res.status(503).json({ error: "Webhook Wave non configuré." });
  }

  // req.rawBody : Buffer brut capturé par express.json({ verify }) dans
  // app.js — la signature Wave porte sur les octets exacts reçus, jamais
  // sur une reconstruction JSON.stringify(req.body) qui pourrait différer
  // (ordre des clés, espaces...).
  const signatureHeader = req.get("Wave-Signature");
  const signatureValide = verifierSignatureWebhook(req.rawBody, signatureHeader, secret);
  if (!signatureValide) {
    return res.status(401).json({ error: "Signature invalide." });
  }

  let event;
  try {
    event = JSON.parse(req.rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Corps invalide." });
  }

  // Répondre 200 rapidement pour tout type d'événement qu'on ne traite pas
  // encore — Wave réessaie jusqu'à 3 jours sur un code hors 2xx, inutile de
  // déclencher des retries pour un événement qu'on ignore volontairement.
  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true });
  }

  const referenceInterne = event.data?.client_reference;
  if (!referenceInterne) {
    return res.status(200).json({ received: true });
  }

  const transaction = await prisma.transaction.findUnique({
    where: { referenceInterne },
    include: { abonnement: { include: { formule: true } } },
  });
  // Transaction inconnue ou pas la nôtre (moyenPaiement autre que WAVE,
  // improbable mais vérifié) : rien à faire, on accuse quand même réception.
  if (!transaction || transaction.moyenPaiement !== "WAVE") {
    return res.status(200).json({ received: true });
  }

  // Idempotence : un webhook rejoué sur une transaction déjà tranchée ne
  // refait rien — jamais de double activation ni de double comptage, quel
  // que soit le nombre de fois où Wave renvoie cet événement.
  if (transaction.statut !== "EN_ATTENTE") {
    return res.status(200).json({ received: true });
  }

  // Défense en profondeur : on ne confirme JAMAIS un paiement sur la seule
  // foi du contenu du webhook, même signé — seule une relecture
  // AUTHENTIFIÉE de la session directement chez Wave fait foi ici (voir
  // consigne : "aucun paiement confirmé sans vérification fiable").
  let session;
  try {
    session = await recupererSession(event.data.id);
  } catch (err) {
    // Échec de LA RELECTURE (panne réseau/API Wave), pas du webhook lui-même
    // — on log pour investigation et on répond 200 : renvoyer une erreur ici
    // ferait réessayer Wave indéfiniment pour un problème qui nous est
    // propre, sans jamais le résoudre. Le webhook suivant (ou une
    // vérification manuelle) pourra retrancher plus tard.
    console.error("Webhook Wave : échec de la relecture de session", err);
    return res.status(200).json({ received: true });
  }

  // Vérification de cohérence supplémentaire (référence + montant) avant de
  // confirmer quoi que ce soit — appartient à la même logique de défense en
  // profondeur que la relecture elle-même.
  const coherent =
    session.client_reference === referenceInterne && Number(session.amount) === Number(transaction.montant);
  const reussi = coherent && session.checkout_status === "complete" && session.payment_status === "succeeded";
  const echoue = session.checkout_status === "expired" || session.payment_status === "cancelled";

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        statut: reussi ? "REUSSIE" : echoue ? "ECHOUEE" : "EN_ATTENTE",
        donneesBrutesWebhook: event,
      },
    });
    if (reussi) {
      const maintenant = new Date();
      const dateExpiration = calculerDateExpiration(maintenant, transaction.abonnement.formule.dureeMois);
      await tx.abonnement.update({
        where: { id: transaction.abonnementId },
        data: { statut: "CONFIRME", dateDebut: maintenant, dateExpiration },
      });
    }
  });

  res.status(200).json({ received: true });
});

export default router;
