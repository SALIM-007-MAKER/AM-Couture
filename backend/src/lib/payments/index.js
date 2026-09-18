import { WavePaymentProvider } from "./WavePaymentProvider.js";
import { NitaPaymentProvider } from "./NitaPaymentProvider.js";
import { AmanataPaymentProvider } from "./AmanataPaymentProvider.js";

// PAYMENTS_MODE=mock simule les paiements (aucun appel réseau vers un vrai
// prestataire) tant que les clés API réelles (WAVE_API_KEY, NITA_API_KEY,
// AMANATA_API_KEY) ne sont pas disponibles. Absent ou toute autre valeur =
// comportement historique inchangé (WAVE échoue explicitement sans clé,
// NITA/Amanata restent manuels) — activer le mock est un choix EXPLICITE,
// jamais un repli silencieux sur une clé manquante en production.
const modeDemande = process.env.PAYMENTS_MODE === "mock";

// Garde-fou : interdit absolument en production, même si quelqu'un laisse
// PAYMENTS_MODE=mock configuré par erreur sur l'environnement réel — un
// abonnement ne doit jamais pouvoir être "payé" par simulation sur la
// plateforme réellement utilisée par les ateliers.
export const PAYMENTS_MOCK_ACTIF = modeDemande && process.env.NODE_ENV !== "production";

if (modeDemande && !PAYMENTS_MOCK_ACTIF) {
  console.warn(
    "PAYMENTS_MODE=mock ignoré : interdit quand NODE_ENV=production. Les paiements utilisent les intégrations réelles.",
  );
}

const PROVIDERS = {
  WAVE: new WavePaymentProvider({ mock: PAYMENTS_MOCK_ACTIF }),
  NITA: new NitaPaymentProvider({ mock: PAYMENTS_MOCK_ACTIF }),
  AMANA: new AmanataPaymentProvider({ mock: PAYMENTS_MOCK_ACTIF }),
};

/** @returns {import("./PaymentProvider.js").PaymentProvider} */
export function getPaymentProvider(moyenPaiement) {
  const provider = PROVIDERS[moyenPaiement];
  if (!provider) throw new Error(`Moyen de paiement inconnu : ${moyenPaiement}`);
  return provider;
}
