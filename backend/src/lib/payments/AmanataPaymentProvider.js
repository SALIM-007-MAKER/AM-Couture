import { PaymentProvider } from "./PaymentProvider.js";

// Même situation que NitaPaymentProvider (voir son commentaire) : pas d'API
// Amanata exploitable aujourd'hui, confirmation manuelle uniquement.
// MoyenPaiement.AMANA (schema.prisma) est conservé tel quel malgré le nom
// "Amanata" ici — voir le commentaire sur l'enum dans schema.prisma.
export class AmanataPaymentProvider extends PaymentProvider {
  moyenPaiement = "AMANA";
  mode = "manuel";

  get verificationAutomatique() {
    return false;
  }

  async initierPaiement() {
    return { referenceExterne: null, checkoutUrl: null };
  }
}
