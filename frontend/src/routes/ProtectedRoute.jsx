import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useMeQuery } from "../hooks/useAuth.js";

/**
 * `!data` (plutôt que `isError`) couvre volontairement DEUX cas identiques
 * pour l'UI : le 401 initial de /auth/me (jamais connecté) ET un cache
 * explicitement vidé à `null` par l'intercepteur 401 de apiClient.js
 * (session expirée en cours d'utilisation) — les deux doivent renvoyer vers
 * /login de la même façon, sans attendre un nouveau round-trip réseau.
 *
 * `isPending` (pas `isLoading`) : sous TanStack Query v5, `isLoading` vaut
 * `isPending && isFetching` — il peut redevenir `false` alors qu'aucune
 * donnée n'est encore arrivée (ex: requête pas encore relancée après une
 * invalidation). `isPending` reste vrai tant que `data` est `undefined`,
 * quel que soit l'état du fetch — sinon `!data` ci-dessous redirigerait
 * brièvement un utilisateur pourtant authentifié vers /login (trouvé lors
 * des tests réels, voir rapport du module Clientes).
 */
export default function ProtectedRoute() {
  const { data, isPending } = useMeQuery();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="min-h-svh flex items-center justify-center gap-2 text-sm text-neutral-500">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Chargement…
      </div>
    );
  }

  if (!data) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
