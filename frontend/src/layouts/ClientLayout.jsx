import { NavLink, Outlet } from "react-router-dom";
import { Scissors, User, Ruler, ClipboardList, Wallet, FileText, Inbox, Bell, LogOut } from "lucide-react";
import { useLogoutMutation } from "../hooks/useAuth.js";

// Espace client final (§ plan rôle USER, Phase 3) — volontairement plus
// simple que AppLayout.jsx (pas de sidebar réductible, pas de branding
// atelier : un USER n'a accès à aucune route de paramètres, voir
// requireClient/auth.middleware.js) — 6 destinations seulement, toutes
// accessibles en permanence (nav du bas sur mobile, onglets en haut sur
// desktop, mêmes items pour éviter deux structures de navigation à tenir
// à jour).
const NAV_ITEMS = [
  { label: "Profil", to: "/client", icon: User, end: true },
  { label: "Mesures", to: "/client/mesures", icon: Ruler },
  { label: "Commandes", to: "/client/commandes", icon: ClipboardList },
  { label: "Paiements", to: "/client/paiements", icon: Wallet },
  { label: "Reçus", to: "/client/recus", icon: FileText },
  { label: "Demandes", to: "/client/demandes", icon: Inbox },
  { label: "Notifications", to: "/client/notifications", icon: Bell },
];

export default function ClientLayout() {
  const logoutMutation = useLogoutMutation();

  return (
    <div className="min-h-svh flex flex-col bg-neutral-50 dark:bg-neutral-950">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow-brand">
            <Scissors className="size-4" aria-hidden="true" />
          </span>
          <span className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 truncate">
            Espace client
          </span>
        </div>
        <button
          type="button"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          className="inline-flex items-center gap-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors"
          title="Se déconnecter"
        >
          <LogOut className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Se déconnecter</span>
        </button>
      </header>

      {/* Onglets desktop — équivalent de la sidebar de AppLayout, mais en
          barre horizontale (pas assez de destinations ici pour justifier une
          sidebar dédiée). */}
      <nav className="hidden md:flex items-center gap-1 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-brand-600 dark:border-brand-400 text-brand-700 dark:text-brand-300"
                  : "border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`
            }
          >
            <item.icon className="size-4" aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 p-4 sm:p-6 pb-24 md:pb-6 overflow-x-hidden">
        <Outlet />
      </main>

      <nav
        aria-label="Navigation principale"
        className="md:hidden fixed inset-x-0 bottom-0 z-30 flex bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 pb-[env(safe-area-inset-bottom)]"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors active:scale-95 ${
                isActive
                  ? "text-brand-600 dark:text-brand-400"
                  : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`flex items-center justify-center rounded-full p-1.5 transition-colors ${
                    isActive ? "bg-brand-50 dark:bg-brand-950" : ""
                  }`}
                >
                  <item.icon className="size-5" aria-hidden="true" />
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
