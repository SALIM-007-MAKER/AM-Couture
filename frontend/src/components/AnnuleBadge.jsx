import { Ban } from "lucide-react";

/** Badge "Annulé" — partagé entre Paiements/Livraisons/Dépenses. */
export default function AnnuleBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 px-2 py-0.5 text-xs font-medium">
      <Ban className="size-3" aria-hidden="true" />
      Annulé
    </span>
  );
}
