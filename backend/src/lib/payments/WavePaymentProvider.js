import crypto from "node:crypto";
import { PaymentProvider } from "./PaymentProvider.js";
import { creerSessionCheckout } from "../wave.js";

// Seul prestataire avec une vérification 100% automatique aujourd'hui
// (webhook signé + relecture serveur, voir webhooks.routes.js) — c'est aussi
// le seul pour lequel une simulation a un intérêt réel : NITA/Amanata restent
// manuels dans tous les cas tant qu'aucune API n'existe pour eux (voir
// NitaPaymentProvider/AmanataPaymentProvider), rien à "simuler" de plus que
// ce que permet déjà leur confirmation manuelle.
export class WavePaymentProvider extends PaymentProvider {
  moyenPaiement = "WAVE";

  constructor({ mock = false } = {}) {
    super();
    this.mock = mock;
    this.mode = mock ? "mock" : "reel";
  }

  get verificationAutomatique() {
    return true;
  }

  async initierPaiement({ montant, referenceInterne, successUrl, errorUrl, transactionId }) {
    if (this.mock) {
      // AUCUN appel réseau vers Wave en mode mock, même si une clé traîne
      // dans l'environnement — la référence externe est fabriquée
      // localement, préfixée pour ne jamais pouvoir être confondue avec un
      // vrai id de session Wave (voir garde dans transactions.routes.js :
      // un id "mock_wave_..." ne peut jamais être "confirmé" par un vrai
      // webhook Wave). checkoutUrl est un chemin RELATIF vers la page de
      // simulation interne (PaiementTestPage.jsx, frontend) — jamais une
      // redirection vers un domaine externe.
      return {
        referenceExterne: `mock_wave_${crypto.randomUUID()}`,
        checkoutUrl: `/abonnement/paiement-test/${transactionId}`,
      };
    }
    const session = await creerSessionCheckout({ montant, referenceInterne, successUrl, errorUrl });
    return { referenceExterne: session.id, checkoutUrl: session.wave_launch_url };
  }
}
