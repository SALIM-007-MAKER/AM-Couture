import { PaymentProvider } from "./PaymentProvider.js";

// Aucune API NITA exploitable aujourd'hui (voir audit Phase 6) — la
// confirmation reste une action EXPLICITE d'un ADMIN qui atteste avoir
// vérifié lui-même la réception du virement sur son propre compte (voir
// POST /api/transactions/:id/confirmer-manuel). NITA_API_KEY n'est donc lu
// nulle part pour l'instant : cette classe n'existe QUE pour que
// abonnements.routes.js n'ait jamais besoin de distinguer "WAVE" des autres
// moyens de paiement dans sa logique — le jour où une vraie API NITA existe,
// seule cette classe change (initierPaiement + verificationAutomatique),
// jamais la logique d'abonnement elle-même.
export class NitaPaymentProvider extends PaymentProvider {
  moyenPaiement = "NITA";
  mode = "manuel";

  get verificationAutomatique() {
    return false;
  }

  async initierPaiement() {
    // Rien à démarrer côté prestataire : l'atelier a déjà fourni sa
    // référence de virement à la création de la Transaction (voir
    // abonnements.routes.js, creerAbonnementSchema) — on attend la
    // confirmation manuelle d'un ADMIN.
    return { referenceExterne: null, checkoutUrl: null };
  }
}
