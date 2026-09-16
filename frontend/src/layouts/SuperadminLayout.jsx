import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Scissors, LayoutDashboard, Building2, CreditCard, Tag, UserCircle, Menu, LogOut, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useMeQuery, useLogoutMutation } from "../hooks/useAuth.js";
import { useUiStore } from "../stores/uiStore.js";

// Shell dédié au SUPERADMIN — délibérément distinct d'AppLayout (Phase 8) :
// AppLayout suppose partout un atelier courant (cloche de notifications,
// logo/paramètres de l'atelier, toute la navigation métier) — autant de
// routes sur lesquelles un SUPERADMIN (sans atelierId) reçoit un 403 (voir
// requireAtelier côté backend). Structure volontairement calquée sur
// AppLayout (sidebar réductible, tiroir mobile) pour une cohérence visuelle
// avec le reste de l'application, mais avec sa propre navigation, propre à
// la gestion de la plateforme plutôt qu'à l'exploitation d'un atelier.
// "Mon compte" pointe vers /mon-compte (PAS /compte, déjà pris par la page
// équivalente côté ADMIN, voir App.jsx) — même composant ComptePage.jsx,
// entièrement générique (langue + mot de passe), aucune dépendance à un
// atelier.
const NAV_ITEMS = [
  { label: "Vue d'ensemble", to: "/vue-ensemble", icon: LayoutDashboard, end: true },
  { label: "Ateliers", to: "/ateliers", icon: Building2 },
  { label: "Abonnements", to: "/gestion-abonnements", icon: CreditCard },
  { label: "Tarifs", to: "/tarifs-abonnement", icon: Tag },
  { label: "Mon compte", to: "/mon-compte", icon: UserCircle },
];

function NavContent({ collapsed, onNavigate }) {
  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg border-l-2 pl-2.5 pr-3 py-2 text-sm font-medium transition-colors ${
              collapsed ? "justify-center border-l-0 pl-3" : ""
            } ${
              isActive
                ? "border-brand-600 dark:border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300 font-semibold hover:bg-brand-100 dark:hover:bg-brand-900"
                : "border-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/60 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`
          }
        >
          <item.icon className="size-4 shrink-0" aria-hidden="true" />
          {!collapsed && item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Logo({ collapsed }) {
  return (
    <div
      className={`flex items-center gap-2 px-4 py-4 border-b border-neutral-200 dark:border-neutral-800 ${collapsed ? "justify-center px-0" : ""}`}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow-brand">
        <Scissors className="size-4" aria-hidden="true" />
      </span>
      {!collapsed && (
        <div className="min-w-0">
          <p className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 truncate">
            Gestion d'Atelier
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-brand-600 dark:text-brand-400">
            Superadmin
          </p>
        </div>
      )}
    </div>
  );
}

function useCurrentNavItem(pathname) {
  return NAV_ITEMS.find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)));
}

export default function SuperadminLayout() {
  const { data: user } = useMeQuery();
  const logoutMutation = useLogoutMutation();
  const { sidebarOpen, closeSidebar, toggleSidebar, sidebarCollapsed, toggleSidebarCollapsed } = useUiStore();
  const location = useLocation();
  const currentNavItem = useCurrentNavItem(location.pathname);

  return (
    <div className="min-h-svh flex bg-neutral-50 dark:bg-neutral-950">
      {/* Sidebar desktop — même comportement réductible que AppLayout.jsx */}
      <aside
        className={`hidden md:flex flex-col shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 transition-[width] duration-150 ${
          sidebarCollapsed ? "w-16" : "w-56 lg:w-64"
        }`}
      >
        <Logo collapsed={sidebarCollapsed} />
        <div className="flex-1 overflow-y-auto">
          <NavContent collapsed={sidebarCollapsed} />
        </div>
        <button
          type="button"
          onClick={toggleSidebarCollapsed}
          className="flex items-center gap-2 border-t border-neutral-200 dark:border-neutral-800 px-3 py-3 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800/60 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          title={sidebarCollapsed ? "Développer" : "Réduire"}
        >
          {sidebarCollapsed ? (
            <ChevronsRight className="size-4 mx-auto" aria-hidden="true" />
          ) : (
            <>
              <ChevronsLeft className="size-4" aria-hidden="true" />
              Réduire
            </>
          )}
        </button>
      </aside>

      {/* Tiroir mobile */}
      <button
        type="button"
        aria-label="Fermer le menu"
        tabIndex={sidebarOpen ? 0 : -1}
        onClick={closeSidebar}
        className={`md:hidden fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        inert={!sidebarOpen}
        className={`md:hidden fixed inset-y-0 left-0 z-40 w-[min(68vw,280px)] flex flex-col bg-white dark:bg-neutral-900 shadow-xl transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Logo collapsed={false} />
        <div className="flex-1 overflow-y-auto">
          <NavContent collapsed={false} onNavigate={closeSidebar} />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={toggleSidebar}
              className="md:hidden rounded-lg p-1.5 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
              aria-label="Ouvrir le menu"
            >
              <Menu className="size-4" aria-hidden="true" />
            </button>
            {currentNavItem && (
              <div className="flex items-center gap-2 min-w-0 text-sm text-neutral-500">
                <currentNavItem.icon className="size-4 shrink-0 hidden sm:block" aria-hidden="true" />
                <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">
                  {currentNavItem.label}
                </span>
              </div>
            )}
          </div>

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

        <main className="flex-1 p-4 sm:p-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
