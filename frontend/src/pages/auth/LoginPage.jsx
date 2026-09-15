import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Scissors, User, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { useLoginMutation, useAtelierPourIdentifiantQuery } from "../../hooks/useAuth.js";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import { useTranslation } from "../../i18n/index.js";
import { ApiError } from "../../lib/apiClient.js";
import { GlobalFormError, FieldError } from "../../components/QueryState.jsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.jsx";

// Écran de connexion volontairement à part du reste de l'app (voir demande —
// esthétique sombre/dorée dédiée, indépendante du thème clair/sombre choisi
// dans Paramètres). `className="dark"` sur le conteneur racine force les
// classes `dark:` des composants partagés (GlobalFormError, FieldError) à
// s'appliquer ici même si l'utilisateur a choisi le thème clair ailleurs
// dans l'app — cette page reste sombre dans tous les cas.
//
// Pas de photo de fond : aucun asset fourni/adapté à un atelier de couture
// (le fond « bureau industriel » de la maquette ne correspond pas au métier)
// — remplacé par un jeu de dégradés sombres + une touche dorée, en CSS pur.
//
// Branding par identifiant (Phase 8 — multi-tenant) : avant connexion, on ne
// sait pas à quel atelier l'utilisateur appartient tant qu'il n'a pas
// commencé à taper son identifiant — plusieurs ateliers partagent cette même
// page, impossible d'en privilégier un par défaut (voir GET
// /api/auth/atelier-pour-identifiant, auth.routes.js). Dès que l'identifiant
// tapé (débouncé) correspond à un compte existant, son logo remplace l'icône
// générique — sinon on garde ce repli de plateforme, jamais le logo d'un
// atelier en particulier.
const NOM_PLATEFORME = "Gestion d'Atelier";

export default function LoginPage() {
  const { t } = useTranslation();
  const [identifiant, setIdentifiant] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const loginMutation = useLoginMutation();
  const debouncedIdentifiant = useDebouncedValue(identifiant, 400);
  const brandingQuery = useAtelierPourIdentifiantQuery(debouncedIdentifiant);
  const logoUrl = brandingQuery.data?.logoUrl;
  const nomAtelier = brandingQuery.data?.nom;

  const redirectTo = location.state?.from?.pathname ?? "/";

  function handleSubmit(e) {
    e.preventDefault();
    loginMutation.mutate(
      { identifiant, password },
      { onSuccess: () => navigate(redirectTo, { replace: true }) },
    );
  }

  const details = loginMutation.error instanceof ApiError ? loginMutation.error.details : undefined;
  const darkInputClass =
    "w-full rounded-xl bg-white/5 border border-white/10 pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition";

  return (
    <div className="dark min-h-svh relative flex items-center justify-center overflow-hidden bg-neutral-950 px-4 py-12">
      {/* Fond — dégradés statiques, aucune image externe */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(217,158,63,0.16),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(39,99,134,0.25),_transparent_60%)]" />
      </div>

      <div className="relative w-full max-w-sm flex flex-col items-center">
        <LanguageSwitcher className="mb-5" />
        <div className="mb-7">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`Logo ${nomAtelier}`}
              className="size-24 rounded-2xl object-contain bg-white/5 border border-white/10 p-2 shadow-[0_0_50px_-5px_rgba(217,158,63,0.35)]"
            />
          ) : (
            <div className="flex size-24 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-[0_0_50px_-5px_rgba(217,158,63,0.45)]">
              <Scissors className="size-10 text-neutral-950" aria-hidden="true" />
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full rounded-3xl bg-neutral-900/70 backdrop-blur-xl border border-white/10 shadow-2xl p-6 space-y-5"
        >
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {t("login.heading")} <span className="text-amber-400">{t("login.headingHighlight")}</span>
            </h1>
            <p className="text-sm text-neutral-400">{t("login.subtitle", { plateforme: NOM_PLATEFORME })}</p>
          </div>

          <GlobalFormError error={loginMutation.error} />

          <div className="space-y-1.5">
            <label htmlFor="identifiant" className="text-sm font-medium text-neutral-300">
              {t("login.identifiant")}
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" aria-hidden="true" />
              <input
                id="identifiant"
                name="identifiant"
                type="text"
                autoComplete="username"
                required
                value={identifiant}
                onChange={(e) => setIdentifiant(e.target.value)}
                className={darkInputClass}
                placeholder={t("login.identifiantPlaceholder")}
              />
            </div>
            <FieldError messages={details?.identifiant} />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium text-neutral-300">
                {t("login.password")}
              </label>
              <Link to="/mot-de-passe-oublie" className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
                {t("login.forgotPassword")}
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" aria-hidden="true" />
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${darkInputClass} pr-10`}
                placeholder={t("login.passwordPlaceholder")}
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
            <FieldError messages={details?.password} />
          </div>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 text-sm font-semibold py-2.5 shadow-lg shadow-amber-900/30 transition disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {loginMutation.isPending ? t("login.submitting") : t("login.submit")}
            {!loginMutation.isPending && <ArrowRight className="size-4" aria-hidden="true" />}
          </button>

          <p className="text-center text-sm text-neutral-400">
            {t("login.ownerQuestion")}{" "}
            <Link to="/inscription" className="text-amber-400 hover:text-amber-300 font-medium transition-colors">
              {t("login.createWorkshop")}
            </Link>
          </p>
        </form>

        <p className="mt-6 text-xs text-neutral-500">{NOM_PLATEFORME}</p>
      </div>
    </div>
  );
}
