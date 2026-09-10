import { Navigate, Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useMeQuery } from "../hooks/useAuth.js";

/**
 * Empêche d'afficher /login à un utilisateur déjà connecté.
 * `isPending`, pas `isLoading` — voir le commentaire de ProtectedRoute.jsx.
 */
export default function PublicOnlyRoute() {
  const { data, isPending } = useMeQuery();

  if (isPending) {
    return (
      <div className="min-h-svh flex items-center justify-center gap-2 text-sm text-neutral-500">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Chargement…
      </div>
    );
  }

  if (data) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
