import { Smartphone, Landmark, Wallet } from "lucide-react";
import { translate } from "../../i18n/index.js";
import { useLocaleStore } from "../../stores/localeStore.js";

// Doit rester synchronisé avec l'enum Prisma MoyenPaiement (schema.prisma).
// WAVE = vérification automatique (webhook signé + relecture serveur, voir
// backend/src/routes/webhooks.routes.js). NITA/AMANA = confirmation
// MANUELLE uniquement (aucune API exploitable aujourd'hui, voir audit
// Phase 6) — jamais présentée comme une vérification automatique.
export const MOYENS_PAIEMENT = [
  { value: "WAVE", label: "Wave", icon: Smartphone, verificationAutomatique: true },
  { value: "NITA", label: "NITA", icon: Landmark, verificationAutomatique: false },
  { value: "AMANA", label: "Amana", icon: Wallet, verificationAutomatique: false },
];

export function moyenPaiementInfo(value) {
  return MOYENS_PAIEMENT.find((m) => m.value === value);
}

// Doit rester synchronisé avec statutEffectif() (backend/src/lib/abonnement.js).
export const STATUT_ABONNEMENT_LABELS = {
  get EN_ATTENTE() { return translate("abo.statut.EN_ATTENTE"); },
  get ACTIF() { return translate("abo.statut.ACTIF"); },
  get EXPIRE() { return translate("abo.statut.EXPIRE"); },
  get ANNULE() { return translate("abo.statut.ANNULE"); },
};

export const STATUT_TRANSACTION_LABELS = {
  get EN_ATTENTE() { return translate("abo.trx.EN_ATTENTE"); },
  get REUSSIE() { return translate("abo.trx.REUSSIE"); },
  get ECHOUEE() { return translate("abo.trx.ECHOUEE"); },
  get ANNULEE() { return translate("abo.trx.ANNULEE"); },
  get EXPIREE() { return translate("abo.trx.EXPIREE"); },
};

function formatDateFr(iso) {
  return new Date(iso).toLocaleDateString(useLocaleStore.getState().locale === "en" ? "en-GB" : "fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

export { formatDateFr };
