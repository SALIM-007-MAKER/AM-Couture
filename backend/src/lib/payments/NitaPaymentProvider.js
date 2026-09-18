import { PaymentProvider } from "./PaymentProvider.js";

// DORMANT (aucun code ne l'appelle aujourd'hui) — aucune API NITA n'est
// exploitable et NITA_API_KEY n'est lue nulle part. Les abonnements sont
// activés manuellement par le SUPERADMIN (voir lib/abonnement.js). Cette
// classe existe pour que la future souscription en ligne n'ait jamais à
// distinguer les moyens de paiement : le jour où une vraie API existe, seule
// cette classe change, jamais la logique d'abonnement.
export class NitaPaymentProvider extends PaymentProvider {
  moyenPaiement = "NITA";
  mode = "manuel";

  get verificationAutomatique() {
    return false;
  }

  async initierPaiement() {
    // Rien à démarrer côté prestataire tant qu'aucune API n'existe.
    return { referenceExterne: null, checkoutUrl: null };
  }
}
