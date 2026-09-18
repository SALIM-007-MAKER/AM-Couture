import { Gift, CheckCircle2, XCircle, Hourglass, Minus } from "lucide-react";
import { useLocaleStore } from "../../stores/localeStore.js";

// Statuts affichés au PDG (voir GET /api/abonnements/etat) — mêmes tons que
// les autres badges de statut de l'app (vert actif, ambre attente/essai,
// rouge expiré, neutre sinon).
export const STATUT_ABONNEMENT_STYLES = {
  ESSAI: { icon: Gift, tone: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  ACTIF: { icon: CheckCircle2, tone: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
  EXPIRE: { icon: XCircle, tone: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  EN_ATTENTE: { icon: Hourglass, tone: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  AUCUN: { icon: Minus, tone: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" },
};

function dateLocale() {
  return useLocaleStore.getState().locale === "en" ? "en-GB" : "fr-FR";
}

export function formatDateFr(iso) {
  return new Date(iso).toLocaleDateString(dateLocale(), { year: "numeric", month: "long", day: "numeric" });
}

export function formatPrix(prix) {
  return Number(prix).toLocaleString(dateLocale(), { maximumFractionDigits: 2 });
}
