import { Navigate, Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useMeQuery, homePathForUser } from "../hooks/useAuth.js";
import { useTranslation } from "../i18n/index.js";

/**
 * Empêche d'afficher /login à un utilisateur déjà connecté.
 * `isPending`, pas `isLoading` — voir le commentaire de ProtectedRoute.jsx.
 */
export default function PublicOnlyRoute() {
  const { t } = useTranslation();
  const { data, isPending } = useMeQuery();

  if (isPending) {
    return (
      <div className="min-h-svh flex items-center justify-center gap-2 text-sm text-neutral-500">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t("common.loading")}
      </div>
    );
  }

  if (data) {
    return <Navigate to={homePathForUser(data)} replace />;
  }

  return <Outlet />;
}
