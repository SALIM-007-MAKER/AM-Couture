import { useState } from "react";
import { Archive, RotateCcw, Check, X } from "lucide-react";
import { GlobalFormError } from "./QueryState.jsx";
import Button from "./Button.jsx";

/**
 * Contrôle archiver/restaurer partagé (Clientes, Modèles — même comportement
 * exact, seul le libellé de confirmation change selon le genre de l'entité).
 * `archived` détermine le sens de l'action ; `onArchive`/`onRestore`
 * déclenchent la mutation correspondante.
 */
export default function ArchiveRestoreControl({
  archived,
  onArchive,
  onRestore,
  isPending,
  error,
  confirmQuestion,
}) {
  const [confirming, setConfirming] = useState(false);
  const action = archived ? onRestore : onArchive;
  const Icon = archived ? RotateCcw : Archive;

  if (confirming) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-neutral-600 dark:text-neutral-400">{confirmQuestion}</span>
          <Button variant="primary" size="sm" icon={Check} loading={isPending} onClick={() => action(() => setConfirming(false))}>
            Confirmer
          </Button>
          <Button variant="secondary" size="sm" icon={X} onClick={() => setConfirming(false)}>
            Annuler
          </Button>
        </div>
        <GlobalFormError error={error} />
      </div>
    );
  }

  return (
    <Button variant="secondary" size="sm" icon={Icon} onClick={() => setConfirming(true)}>
      {archived ? "Restaurer" : "Archiver"}
    </Button>
  );
}
