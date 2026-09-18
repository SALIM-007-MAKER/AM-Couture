import { useTranslation } from "../../../i18n/index.js";

// États d'abonnement d'un atelier (voir etatAbonnementAtelier, backend/src/lib/abonnement.js).
const TONES = {
  ACTIF: "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400",
  ESSAI: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400",
  EN_ATTENTE: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400",
  EXPIRE: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400",
  AUCUN: "bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
};

export default function EtatAbonnementBadge({ statut }) {
  const { t } = useTranslation();
  const key = TONES[statut] ? statut : "AUCUN";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONES[key]}`}>
      {t(`saSub.state.${key}`)}
    </span>
  );
}
