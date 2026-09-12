import { statutPaiementLabel, STATUT_PAIEMENT_ICONS } from "../constants.js";

// Couleurs sémantiques (rouge/orange/vert) — jamais confondu avec le badge
// de statut de COMMANDE (CommandeStatutBadge, palette différente) : les deux
// notions restent distinctes partout dans l'app, y compris visuellement.
const COLORS = {
  NON_PAYE: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  PARTIELLEMENT_PAYE: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  PAYE: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
};

export default function PaiementStatutBadge({ statut }) {
  const Icon = STATUT_PAIEMENT_ICONS[statut];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        COLORS[statut] ?? COLORS.NON_PAYE
      }`}
    >
      {Icon && <Icon className="size-3" aria-hidden="true" />}
      {statutPaiementLabel(statut)}
    </span>
  );
}
