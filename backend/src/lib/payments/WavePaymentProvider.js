import { PaymentProvider } from "./PaymentProvider.js";
import { creerSessionCheckout } from "../wave.js";

// DORMANT : aucun code n'appelle ce fournisseur aujourd'hui (abonnements
// activés manuellement, voir lib/abonnement.js) et aucune clé API n'est
// configurée. Prêt à être branché quand WAVE_API_KEY existera : seul
// prestataire à vérification automatique (webhook signé + relecture serveur,
// voir routes/webhooks.routes.js).
export class WavePaymentProvider extends PaymentProvider {
  moyenPaiement = "WAVE";

  mode = "reel";

  get verificationAutomatique() {
    return true;
  }

  async initierPaiement({ montant, referenceInterne, successUrl, errorUrl }) {
    const session = await creerSessionCheckout({ montant, referenceInterne, successUrl, errorUrl });
    return { referenceExterne: session.id, checkoutUrl: session.wave_launch_url };
  }
}
