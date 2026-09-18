import { PaymentProvider } from "./PaymentProvider.js";

// DORMANT, même situation que NitaPaymentProvider (voir son commentaire).
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
