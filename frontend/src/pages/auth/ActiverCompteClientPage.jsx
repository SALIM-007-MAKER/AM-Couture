import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Scissors, Lock, Eye, EyeOff, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { useActiverCompteClientMutation } from "../../hooks/useAuth.js";
import { GlobalFormError } from "../../components/QueryState.jsx";
import { useTranslation } from "../../i18n/index.js";

// Dernière étape de l'invitation envoyée par l'ADMIN (voir
// InviterClientButton.jsx et POST /clientes/:id/inviter) — atteinte depuis
// le lien transmis par l'atelier. Volontairement PAS sous
// PublicOnlyRoute/ProtectedRoute (voir App.jsx), même raisonnement que
// ReinitialiserMotDePasseTokenPage.jsx : le jeton dans l'URL authentifie
// l'action à lui seul, indépendamment de toute session déjà ouverte dans ce
// navigateur. Contrairement à cette dernière, l'activation CONNECTE
// immédiatement (voir useActiverCompteClientMutation) : on redirige donc
// directement vers l'espace client plutôt que vers /login.
const NOM_PLATEFORME = "Gestion d'Atelier";

export default function ActiverCompteClientPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();
  const mutation = useActiverCompteClientMutation();
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [confirmationError, setConfirmationError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const darkInputClass =
    "w-full rounded-xl bg-white/5 border border-white/10 pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition";

  function handleSubmit(e) {
    e.preventDefault();
    setConfirmationError("");
    if (nouveauMotDePasse !== confirmation) {
      setConfirmationError(t("activation.confirmMismatch"));
      return;
    }
    mutation.mutate(
      { token, nouveauMotDePasse },
      { onSuccess: () => setTimeout(() => navigate("/client", { replace: true }), 1500) },
    );
  }

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

        <div className="w-full rounded-3xl bg-neutral-900/70 backdrop-blur-xl border border-white/10 shadow-2xl p-6 space-y-5">
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-white">{t("activation.heading")}</h1>
            <p className="text-sm text-neutral-400">{t("activation.subtitle")}</p>
          </div>

          {!token ? (
            <p className="flex items-start gap-2 rounded-xl bg-red-950/60 text-red-300 text-sm px-3 py-3">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
              {t("activation.invalidLink")}
            </p>
          ) : mutation.isSuccess ? (
            <p className="flex items-start gap-2 rounded-xl bg-green-950/60 text-green-300 text-sm px-3 py-3 animate-fade-in">
              <CheckCircle2 className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
              {t("activation.success")}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <GlobalFormError error={mutation.error} />
              <div className="space-y-1.5">
                <label htmlFor="nouveauMotDePasse" className="text-sm font-medium text-neutral-300">
                  {t("activation.password")}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" aria-hidden="true" />
                  <input
                    id="nouveauMotDePasse"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={nouveauMotDePasse}
                    onChange={(e) => setNouveauMotDePasse(e.target.value)}
                    className={`${darkInputClass} pr-10`}
                    placeholder={t("activation.passwordPlaceholder")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
                    aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                  >
                    {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="confirmation" className="text-sm font-medium text-neutral-300">
                  {t("activation.confirmPassword")}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" aria-hidden="true" />
                  <input
                    id="confirmation"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    className={darkInputClass}
                  />
                </div>
                {confirmationError && <p className="text-xs text-red-400 mt-1">{confirmationError}</p>}
              </div>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 text-sm font-semibold py-2.5 shadow-lg shadow-amber-900/30 transition disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {mutation.isPending ? t("activation.submitting") : t("activation.submit")}
                {!mutation.isPending && <ArrowRight className="size-4" aria-hidden="true" />}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-xs text-neutral-500">{NOM_PLATEFORME}</p>
      </div>
    </div>
  );
}
