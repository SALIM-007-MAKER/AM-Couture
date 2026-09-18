import { STATUT_ABONNEMENT_STYLES } from "../constants.js";
import { useTranslation } from "../../../i18n/index.js";

export default function StatutAbonnementBadge({ statut }) {
  const { t } = useTranslation();
  const { icon: Icon, tone } = STATUT_ABONNEMENT_STYLES[statut] ?? STATUT_ABONNEMENT_STYLES.AUCUN;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      <Icon className="size-3" aria-hidden="true" />
      {t(`sub.status.${statut}`)}
    </span>
  );
}
