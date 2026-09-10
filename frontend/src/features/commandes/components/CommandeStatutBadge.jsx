import { Sparkles } from "lucide-react";
import { statutLabel, STATUT_ICONS } from "../constants.js";

const COLORS = {
  NOUVELLE: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  EN_CONFECTION: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  ESSAYAGE: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  RETOUCHES: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  TERMINEE: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400",
  LIVREE: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  ANNULEE: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

export default function CommandeStatutBadge({ statut }) {
  const Icon = STATUT_ICONS[statut] ?? Sparkles;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        COLORS[statut] ?? COLORS.NOUVELLE
      }`}
    >
      <Icon className="size-3" aria-hidden="true" />
      {statutLabel(statut)}
    </span>
  );
}
