import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { log, messageErreur } from "../lib/logger.js";
import { verifierSignatureWebhook, paiementWaveActif, ErreurWave } from "../lib/wave.js";
import { traiterEvenementWave } from "../lib/paiementEnLigne.js";

// PAS de requireAuth ni de cookie : Wave appelle cette route directement. La confiance vient EXCLUSIVEMENT de la
// signature HMAC (lib/wave.js), jamais d'une exception « on fait confiance quand même » si le secret est absent
// ou si la signature ne correspond pas. Même avec une signature valide, le contenu n'est qu'un déclencheur : l'état
// du paiement est relu chez Wave (lib/paiementEnLigne.js).
const router = Router();

// POST /api/webhooks/wave — événements Wave (docs.wave.com/webhook) :
//   checkout.session.completed       → relecture de la session, confirmation si tout concorde
//   checkout.session.payment_failed  → tracé, sans conclure (la session reste ouverte jusqu'à son expiration)
// Autres types : accusé de réception sans effet.
//
// Codes de réponse : 200 = événement pris en compte (ou sans objet) ; 401 = signature invalide ; 503 = on ne peut
// pas conclure maintenant (Wave injoignable, paiement Wave non activé) — Wave réessaie alors pendant 3 jours.
router.post("/wave", async (req, res) => {
  // Fonction désactivée : aucune exception, aucun traitement.
  if (!paiementWaveActif()) {
    return res.status(503).json({ error: "Paiement Wave non activé." });
  }
  const secret = process.env.WAVE_WEBHOOK_SECRET;

  // req.rawBody : octets exacts reçus (voir app.js). La signature porte sur eux, pas sur un JSON reconstruit.
  if (!req.rawBody || !verifierSignatureWebhook(req.rawBody, req.get("Wave-Signature"), secret)) {
    return res.status(401).json({ error: "Signature invalide." });
  }

  let event;
  try {
    event = JSON.parse(req.rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Corps invalide." });
  }

  try {
    await traiterEvenementWave(prisma, event);
  } catch (err) {
    if (err instanceof ErreurWave) {
      // Relecture impossible (panne chez Wave ou chez nous) : état INCONNU, on ne conclut rien et on demande une
      // nouvelle livraison plutôt que de répondre 200 et d'oublier l'événement.
      log.warn("abonnement", { evenement: "webhook_wave_relecture_echec", evenementId: event?.id, message: messageErreur(err) });
      return res.status(503).json({ error: "Vérification auprès de Wave impossible pour le moment." });
    }
    throw err;
  }
  res.status(200).json({ received: true });
});

export default router;
