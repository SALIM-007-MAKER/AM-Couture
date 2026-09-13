import { NavLink, Outlet } from "react-router-dom";
import { Scissors, Building2, LogOut } from "lucide-react";
import { useMeQuery, useLogoutMutation } from "../hooks/useAuth.js";

// Shell dédié au SUPERADMIN — délibérément distinct d'AppLayout (Phase 8) :
// AppLayout suppose partout un atelier courant (cloche de notifications,
// logo/paramètres de l'atelier, toute la navigation métier) — autant de
// routes sur lesquelles un SUPERADMIN (sans atelierId) reçoit un 403 (voir
// requireAtelier côté backend). Pour l'instant, sa seule destination est la
// gestion des ateliers de la plateforme (pas encore de "Mon compte" ici —
// à ajouter si un écran dédié SUPERADMIN en a besoin).
const NAV_ITEMS = [{ label: "Ateliers", to: "/ateliers", icon: Building2 }];

export default function SuperadminLayout() {
  const { data: user } = useMeQuery();
  const logoutMutation = useLogoutMutation();

  return (
    <div className="min-h-svh flex flex-col bg-neutral-50 dark:bg-neutral-950">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow-brand">
            <Scissors className="size-4" aria-hidden="true" />
          </span>
          <span className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 truncate">
            Gestion d'Atelier
          </span>
          <span className="hidden sm:inline text-xs font-medium uppercase tracking-wider text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800 rounded-full px-2 py-0.5">
            Superadmin
          </span>
        </div>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                    : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/60 hover:text-neutral-900 dark:hover:text-neutral-100"
                }`
              }
            >
              <item.icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {user && (
            <div className="hidden sm:flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-950 text-xs font-semibold text-brand-700 dark:text-brand-300">
                {user.identifiant.slice(0, 2).toUpperCase()}
              </span>
              <span className="text-sm text-neutral-600 dark:text-neutral-400">{user.identifiant}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="inline-flex items-center gap-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors"
            title="Déconnexion"
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
