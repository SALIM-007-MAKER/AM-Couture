import { CheckCircle2, Archive } from "lucide-react";

/**
 * Badge actif/archivé générique — partagé entre toutes les entités
 * archivables (Clientes, Modèles, ...). `activeLabel`/`archivedLabel`
 * permettent l'accord grammatical correct selon le genre de l'entité
 * ("Active"/"Archivée" pour une cliente, "Actif"/"Archivé" pour un modèle).
 */
export default function StatutBadge({ archivedAt, activeLabel = "Active", archivedLabel = "Archivée" }) {
  const archived = Boolean(archivedAt);
  const Icon = archived ? Archive : CheckCircle2;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        archived
          ? "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
          : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
      }`}
    >
      <Icon className="size-3" aria-hidden="true" />
      {archived ? archivedLabel : activeLabel}
    </span>
  );
}
