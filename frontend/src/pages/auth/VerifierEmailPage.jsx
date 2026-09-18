import { useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Scissors, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useVerifierEmailMutation } from "../../hooks/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { useTranslation } from "../../i18n/index.js";

// Page atteinte depuis le lien envoyé par email à l'inscription (voir POST
// /inscription-atelier) — volontairement PAS sous PublicOnlyRoute/
// ProtectedRoute (voir App.jsx) : la personne est très probablement déjà
// connectée (l'inscription connecte immédiatement) quand elle clique ce
// lien, souvent dans le même navigateur — cette page doit rester accessible
// dans les deux cas.
const NOM_PLATEFORME = "Gestion d'Atelier";

export default function VerifierEmailPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const mutation = useVerifierEmailMutation();
  // Le jeton est à usage unique (voir consommerToken, backend) : un seul
  // appel doit partir même si React re-rend ce composant plusieurs fois
  // (StrictMode, navigation…) — useRef plutôt qu'un state pour ne déclencher
  // aucun re-render supplémentaire depuis cette garde.
  const dejaLance = useRef(false);

  useEffect(() => {
    if (!token || dejaLance.current) return;
    dejaLance.current = true;
    mutation.mutate({ token });
    // eslint-disable-next-line
  }, [token]);

  const messageErreur =
    mutation.error instanceof ApiError ? mutation.error.message : t("ui.errorGeneric");

  return (
    <div className="dark min-h-svh relative flex items-center justify-center overflow-hidden bg-neutral-950 px-4 py-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(217,158,63,0.16),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(39,99,134,0.25),_transparent_60%)]" />
      </div>

      <div className="relative w-full max-w-sm flex flex-col items-center">
        <div className="mb-7">
          <div className="flex size-24 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-[0_0_50px_-5px_rgba(217,158,63,0.45)]">
            <Scissors className="size-10 text-neutral-950" aria-hidden="true" />
          </div>
        </div>

        <div className="w-full rounded-3xl bg-neutral-900/70 backdrop-blur-xl border border-white/10 shadow-2xl p-6 space-y-5 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">{t("auth.verify.title")}</h1>

          {!token && (
            <p className="flex items-start gap-2 rounded-xl bg-red-950/60 text-red-300 text-sm px-3 py-3 text-left">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
              {t("auth.verify.invalid")}
            </p>
          )}

          {token && mutation.isPending && (
            <p className="flex items-center justify-center gap-2 text-sm text-neutral-400 py-4">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {t("auth.verify.pending")}
            </p>
          )}

          {token && mutation.isSuccess && (
            <p className="flex items-start gap-2 rounded-xl bg-green-950/60 text-green-300 text-sm px-3 py-3 text-left animate-fade-in">
              <CheckCircle2 className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
              {t("auth.verify.success")}
            </p>
          )}

          {token && mutation.isError && (
            <p className="flex items-start gap-2 rounded-xl bg-red-950/60 text-red-300 text-sm px-3 py-3 text-left">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
              {messageErreur}
            </p>
          )}

          <Link to="/" className="inline-block text-sm text-amber-400 hover:text-amber-300 font-medium transition-colors">
            {t("auth.verify.backToApp")}
          </Link>
        </div>

        <p className="mt-6 text-xs text-neutral-500">{NOM_PLATEFORME}</p>
      </div>
    </div>
  );
}
