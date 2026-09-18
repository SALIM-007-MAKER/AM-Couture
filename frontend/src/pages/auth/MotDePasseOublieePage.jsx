import { useState } from "react";
import { Link } from "react-router-dom";
import { Scissors, User, ArrowRight, CheckCircle2 } from "lucide-react";
import { useMotDePasseOublieMutation } from "../../hooks/useAuth.js";
import { GlobalFormError } from "../../components/QueryState.jsx";
import { useTranslation } from "../../i18n/index.js";

// Même esthétique que LoginPage.jsx. Le message de succès est TOUJOURS le
// même quel que soit l'identifiant tapé (voir motDePasseOublieSchema,
// backend) — jamais de distinction "compte trouvé" / "compte introuvable"
// affichée ici, pour ne pas réintroduire côté frontend la fuite que le
// backend évite déjà.
const NOM_PLATEFORME = "Gestion d'Atelier";

export default function MotDePasseOublieePage() {
  const { t } = useTranslation();
  const [identifiant, setIdentifiant] = useState("");
  const mutation = useMotDePasseOublieMutation();
  const darkInputClass =
    "w-full rounded-xl bg-white/5 border border-white/10 pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition";

  function handleSubmit(e) {
    e.preventDefault();
    mutation.mutate({ identifiant });
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
            <h1 className="text-2xl font-semibold tracking-tight text-white">{t("login.forgotPassword")}</h1>
            <p className="text-sm text-neutral-400">
              {t("auth.forgot.intro")}
            </p>
          </div>

          {mutation.isSuccess ? (
            <p className="flex items-start gap-2 rounded-xl bg-green-950/60 text-green-300 text-sm px-3 py-3 animate-fade-in">
              <CheckCircle2 className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
              {t("auth.forgot.success")}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <GlobalFormError error={mutation.error} />
              <div className="space-y-1.5">
                <label htmlFor="identifiant" className="text-sm font-medium text-neutral-300">
                  {t("login.identifiant")}
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" aria-hidden="true" />
                  <input
                    id="identifiant"
                    type="text"
                    autoComplete="username"
                    required
                    value={identifiant}
                    onChange={(e) => setIdentifiant(e.target.value)}
                    className={darkInputClass}
                    placeholder={t("login.identifiantPlaceholder")}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 text-sm font-semibold py-2.5 shadow-lg shadow-amber-900/30 transition disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {mutation.isPending ? t("auth.forgot.sending") : t("auth.forgot.send")}
                {!mutation.isPending && <ArrowRight className="size-4" aria-hidden="true" />}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-neutral-400">
            <Link to="/login" className="text-amber-400 hover:text-amber-300 font-medium transition-colors">
              {t("auth.backToLogin")}
            </Link>
          </p>
        </div>

        <p className="mt-6 text-xs text-neutral-500">{NOM_PLATEFORME}</p>
      </div>
    </div>
  );
}
