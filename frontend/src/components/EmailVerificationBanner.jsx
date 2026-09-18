import { MailWarning, CheckCircle2 } from "lucide-react";
import { useMeQuery, useRenvoyerVerificationEmailMutation } from "../hooks/useAuth.js";
import { ApiError } from "../lib/apiClient.js";
import Button from "./Button.jsx";
import { useTranslation } from "../i18n/index.js";

// Affichée uniquement pour un compte qui A un email (inscription en
// libre-service, voir InscriptionAtelierPage.jsx) mais ne l'a pas encore
// confirmé — jamais bloquante (voir décision : accès immédiat après
// inscription), juste un rappel. Un compte sans email (ex: "admin", créé
// avant cette phase) ne voit jamais cette bannière : `user.email` est alors
// `null`, la condition ci-dessous ne matche pas.
export default function EmailVerificationBanner() {
  const { t } = useTranslation();
  const { data: user } = useMeQuery();
  const mutation = useRenvoyerVerificationEmailMutation();

  if (!user?.email || user.emailVerifieLe) return null;

  const message = mutation.error instanceof ApiError ? mutation.error.message : null;

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 px-4 py-2 text-sm">
      <p className="flex items-center gap-2 text-amber-800 dark:text-amber-300 min-w-0">
        <MailWarning className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{t("ui.emailBanner.confirm", { email: user.email })}</span>
      </p>
      <div className="flex items-center gap-2 shrink-0">
        {mutation.isSuccess && (
          <span className="flex items-center gap-1 text-green-700 dark:text-green-400 text-xs">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {t("ui.emailBanner.resent")}
          </span>
        )}
        {message && <span className="text-red-600 dark:text-red-400 text-xs">{message}</span>}
        <Button variant="ghost" size="sm" loading={mutation.isPending} onClick={() => mutation.mutate()}>
          {t("ui.emailBanner.resend")}
        </Button>
      </div>
    </div>
  );
}
