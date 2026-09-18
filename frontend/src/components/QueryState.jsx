import { Loader2, AlertCircle, Inbox, RotateCcw } from "lucide-react";
import { ApiError } from "../lib/apiClient.js";
import { useTranslation } from "../i18n/index.js";

export function LoadingState({ label }) {
  const { t } = useTranslation();
  return (
    <p className="flex items-center justify-center gap-2 text-sm text-neutral-500 py-8">
      <Loader2 className="size-4 animate-spin text-brand-500 dark:text-brand-400" aria-hidden="true" />
      {label ?? t("common.loading")}
    </p>
  );
}

/** `error` vient directement de TanStack Query (donc de apiClient.ApiError) —
 * on affiche son message tel quel, jamais une nouvelle formulation inventée. */
export function ErrorState({ error, onRetry }) {
  const { t } = useTranslation();
  const message = error instanceof ApiError ? error.message : t("ui.errorGeneric");
  return (
    <div className="rounded-2xl bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-sm px-4 py-3 flex items-center justify-between gap-3 animate-fade-in">
      <span className="flex items-center gap-2">
        <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
        {message}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-red-300 dark:border-red-800 px-2.5 py-1.5 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
        >
          <RotateCcw className="size-3" aria-hidden="true" />
          {t("ui.retry")}
        </button>
      )}
    </div>
  );
}

/** `icon` : composant lucide optionnel, plus parlant que l'icône générique
 * par défaut selon le contexte (ex: Users pour "Aucune cliente"). */
export function EmptyState({ children, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-sm text-neutral-500 py-10 text-center">
      <span className="flex items-center justify-center size-14 rounded-full bg-neutral-100 dark:bg-neutral-800/60">
        <Icon className="size-6 text-neutral-400 dark:text-neutral-600" aria-hidden="true" />
      </span>
      <p>{children}</p>
    </div>
  );
}

/** Erreurs de champ issues de `formatZodError()` (backend) : `{champ:
 * [messages]}`. Affiche tel quel, jamais une validation recalculée côté client. */
export function FieldError({ messages }) {
  if (!messages?.length) return null;
  return <p className="text-xs text-red-600 dark:text-red-400 mt-1">{messages.join(" ")}</p>;
}

export function GlobalFormError({ error }) {
  const { t } = useTranslation();
  if (!error) return null;
  // Une erreur qui n'est pas une ApiError (requête réseau interrompue,
  // timeout, etc. — jamais vu en pratique avant l'upload d'images, dont les
  // payloads plus gros et plus lents à écrire rendent ce cas bien plus
  // probable) n'a pas de `details` structuré : on affiche quand même un
  // message générique plutôt que de laisser l'échec totalement invisible.
  if (!(error instanceof ApiError)) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-sm px-3 py-2 animate-fade-in">
        <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
        {t("ui.errorNetwork")}
      </p>
    );
  }
  // Un message de détail par champ est déjà affiché près du champ concerné —
  // ici on ne montre que les erreurs sans champ précis (_global) ou l'absence
  // totale de détail (ex : 409 métier, 404).
  const globalMessages = error.details?._global;
  if (!error.details || globalMessages) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-sm px-3 py-2 animate-fade-in">
        <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
        {globalMessages ? globalMessages.join(" ") : error.message}
      </p>
    );
  }
  return null;
}
