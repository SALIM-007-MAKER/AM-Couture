import { statutDemandeLabel, STATUT_DEMANDE_ICONS, STATUT_DEMANDE_COLORS } from "../constants.js";

export default function StatutDemandeBadge({ statut }) {
  const Icon = STATUT_DEMANDE_ICONS[statut];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        STATUT_DEMANDE_COLORS[statut] ?? STATUT_DEMANDE_COLORS.EN_ATTENTE
      }`}
    >
      {Icon && <Icon className="size-3" aria-hidden="true" />}
      {statutDemandeLabel(statut)}
    </span>
  );
}
