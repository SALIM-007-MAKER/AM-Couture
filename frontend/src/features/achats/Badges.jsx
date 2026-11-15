import { useTranslation } from "../../i18n/index.js";

const BASE = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
const TONS = {
  AUCUNE: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  PARTIELLE: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  COMPLETE: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  PAYE: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  NON_PAYE: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  ANNULE: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

export function BadgeReception({ statut }) {
  const { t } = useTranslation();
  return <span className={`${BASE} ${TONS[statut]}`} data-testid="badge-reception">{t(`ach.reception.${statut}`)}</span>;
}

// Absent quand le serveur masque le paiement (employé sans « finances.voir »).
export function BadgePaiement({ statut }) {
  const { t } = useTranslation();
  if (!statut) return null;
  return <span className={`${BASE} ${TONS[statut]}`} data-testid="badge-paiement">{t(`ach.paiement.${statut}`)}</span>;
}

export function BadgeAnnule() {
  const { t } = useTranslation();
  return <span className={`${BASE} ${TONS.ANNULE}`}>{t("ach.annule")}</span>;
}
