import { WavePaymentProvider } from "./WavePaymentProvider.js";
import { NitaPaymentProvider } from "./NitaPaymentProvider.js";
import { AmanataPaymentProvider } from "./AmanataPaymentProvider.js";

// COUCHE PAIEMENT (Payment) — DORMANTE. Aucun paiement en ligne n'est actif :
// les abonnements sont activés manuellement par le SUPERADMIN (voir
// lib/abonnement.js et ateliersAbonnement.routes.js). Aucune simulation
// n'existe : ni mode test, ni faux paiement.
//
// Le jour où les clés Wave/NITA/Amanata existeront (WAVE_API_KEY,
// NITA_API_KEY, AMANATA_API_KEY — jamais côté frontend), il suffira d'ajouter
// une route de souscription qui appelle getPaymentProvider(...).initierPaiement()
// puis, à la confirmation, activerAbonnement() : la logique d'abonnement
// elle-même ne change pas.
const PROVIDERS = {
  WAVE: new WavePaymentProvider(),
  NITA: new NitaPaymentProvider(),
  AMANA: new AmanataPaymentProvider(),
};

/** @returns {import("./PaymentProvider.js").PaymentProvider} */
export function getPaymentProvider(moyenPaiement) {
  const provider = PROVIDERS[moyenPaiement];
  if (!provider) throw new Error(`Moyen de paiement inconnu : ${moyenPaiement}`);
  return provider;
}
