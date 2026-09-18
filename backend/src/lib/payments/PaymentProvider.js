// Interface commune à tous les moyens de paiement d'abonnement (Wave, NITA,
// Amanata...) — permet à abonnements.routes.js / webhooks.routes.js de
// traiter les trois moyens de façon identique, sans jamais connaître les
// détails d'un prestataire particulier. Chaque prestataire réel
// (WavePaymentProvider, NitaPaymentProvider, AmanataPaymentProvider)
// l'implémente ; getPaymentProvider() (index.js) choisit laquelle instancier.
//
// Contrat de sécurité commun à TOUTE implémentation :
// aucune méthode ici ne doit jamais faire confiance à une donnée envoyée par
// le frontend pour décider qu'un paiement a réussi. `initierPaiement` ne fait
// que démarrer une tentative (retourne où rediriger l'atelier) ;
// `traiterWebhook`/`verifierPaiement` sont les SEULS points d'entrée
// autorisés à faire réussir un paiement, et restent du ressort du serveur
// (webhook signé + relecture serveur, ou confirmation manuelle explicite).
export class PaymentProvider {
  /** Identifiant MoyenPaiement (schema.prisma) — "WAVE" | "NITA" | "AMANA". */
  moyenPaiement = "INDEFINI";

  /** "reel" (API/webhook du prestataire) | "manuel" (confirmation humaine). */
  mode = "manuel";

  /** true si ce prestataire peut confirmer un paiement automatiquement (webhook/API) sans action humaine. */
  get verificationAutomatique() {
    return false;
  }

  /**
   * Démarre une tentative de paiement pour une Transaction déjà créée
   * (EN_ATTENTE en base). Ne modifie JAMAIS le statut de la transaction —
   * seul l'appelant écrit en base, à partir de ce
   * qui est retourné ici.
   * @param {{ montant: number|string, referenceInterne: string, successUrl: string, errorUrl: string }} params
   * @returns {Promise<{ referenceExterne: string|null, checkoutUrl: string|null }>}
   */
  async initierPaiement(_params) {
    throw new Error(`${this.moyenPaiement} : initierPaiement() non implémenté.`);
  }
}
