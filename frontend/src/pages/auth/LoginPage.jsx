import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Scissors, User, Lock, LogIn } from "lucide-react";
import { useLoginMutation } from "../../hooks/useAuth.js";
import { useParametresPublicQuery } from "../../features/parametres/hooks.js";
import { ApiError } from "../../lib/apiClient.js";
import { GlobalFormError, FieldError } from "../../components/QueryState.jsx";
import { inputClass } from "../../components/FormField.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";

export default function LoginPage() {
  const [identifiant, setIdentifiant] = useState("");
  const [password, setPassword] = useState("");
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

  return (
    <div className="min-h-svh flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      <Card as="form" onSubmit={handleSubmit} variant="outlined" className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-2">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`Logo ${nom}`}
              className="mx-auto size-12 rounded-full object-contain bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-800"
            />
          ) : (
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-600 text-white">
              <Scissors className="size-6" aria-hidden="true" />
            </div>
          )}
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">{nom}</h1>
          <p className="text-sm text-neutral-500">Connexion à l'atelier</p>
        </div>

        <GlobalFormError error={loginMutation.error} />

        <div className="space-y-1">
          <label htmlFor="identifiant" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Identifiant
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" aria-hidden="true" />
            <input
              id="identifiant"
              name="identifiant"
              type="text"
              autoComplete="username"
              required
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>
          <FieldError messages={details?.identifiant} />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Mot de passe
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" aria-hidden="true" />
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>
          <FieldError messages={details?.password} />
        </div>

        <Button type="submit" variant="primary" icon={LogIn} loading={loginMutation.isPending} className="w-full">
          {loginMutation.isPending ? "Connexion…" : "Se connecter"}
        </Button>
      </Card>
    </div>
  );
}
