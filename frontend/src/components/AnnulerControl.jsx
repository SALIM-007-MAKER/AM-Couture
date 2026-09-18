import { useState } from "react";
import { Ban, X } from "lucide-react";
import { ApiError } from "../lib/apiClient.js";
import Button from "./Button.jsx";
import { useTranslation } from "../i18n/index.js";

/**
 * Contrôle d'annulation réutilisé par Paiements/Livraisons/Dépenses — motif
 * obligatoire (mêmes règles que le backend, voir annulation.schema.js),
 * confirmation en deux temps comme ArchiveRestoreControl (Modèles/Clientes).
 * `onAnnuler(motif)` doit renvoyer la Promise de la mutation.
 */
export default function AnnulerControl({ onAnnuler, isPending, error, label }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [motif, setMotif] = useState("");
  const message = error instanceof ApiError ? error.message : null;

  if (!confirming) {
    return (
      <Button variant="danger-ghost" size="sm" icon={Ban} onClick={() => setConfirming(true)} className="p-0!">
        {label ?? t("common.cancel")}
      </Button>
    );
  }

  return (
    <div className="space-y-1.5 text-left">
      <input
        type="text"
        placeholder={t("ui.cancelReasonPlaceholder")}
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
      />
      <div className="flex gap-2 flex-wrap">
        <Button
          variant="danger"
          size="sm"
          icon={Ban}
          loading={isPending}
          disabled={motif.trim().length < 3}
          onClick={() => onAnnuler(motif.trim())}
        >
          {t("ui.confirmCancellation")}
        </Button>
        <Button variant="secondary" size="sm" icon={X} onClick={() => setConfirming(false)}>
          {t("common.cancel")}
        </Button>
      </div>
      {message && <p className="text-xs text-red-600 dark:text-red-400">{message}</p>}
    </div>
  );
}
