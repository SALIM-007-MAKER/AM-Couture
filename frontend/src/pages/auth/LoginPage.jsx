import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Scissors, User, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { useLoginMutation } from "../../hooks/useAuth.js";
import { useParametresPublicQuery } from "../../features/parametres/hooks.js";
import { ApiError } from "../../lib/apiClient.js";
import { GlobalFormError, FieldError } from "../../components/QueryState.jsx";

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
export default function LoginPage() {
  const [identifiant, setIdentifiant] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const loginMutation = useLoginMutation();
  // isPending/isError ignorés volontairement : en cas d'échec (ou pendant le
  // chargement), la page garde son repli générique (icône ciseaux + "AM
  // Couture") plutôt que de bloquer l'écran de connexion pour un détail
  // décoratif.
  const publicQuery = useParametresPublicQuery();
  const nom = publicQuery.data?.nom || "AM Couture";
  const logoUrl = publicQuery.data?.logoUrl;

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
        <div className="mb-7">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`Logo ${nom}`}
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
              Bon retour <span className="text-amber-400">parmi nous</span>
            </h1>
            <p className="text-sm text-neutral-400">Connectez-vous pour accéder à {nom}</p>
          </div>

          <GlobalFormError error={loginMutation.error} />

          <div className="space-y-1.5">
            <label htmlFor="identifiant" className="text-sm font-medium text-neutral-300">
              Identifiant
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
                placeholder="Votre identifiant"
              />
            </div>
            <FieldError messages={details?.identifiant} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-neutral-300">
              Mot de passe
            </label>
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
                placeholder="Votre mot de passe"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
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
            {loginMutation.isPending ? "Connexion…" : "Se connecter"}
            {!loginMutation.isPending && <ArrowRight className="size-4" aria-hidden="true" />}
          </button>
        </form>

        <p className="mt-6 text-xs text-neutral-500">{nom}</p>
      </div>
    </div>
  );
}
