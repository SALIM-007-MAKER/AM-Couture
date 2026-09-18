import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Scissors, User, Ruler, ClipboardList, Wallet, FileText, Inbox, Bell, Menu, LogOut } from "lucide-react";
import { useLogoutMutation } from "../hooks/useAuth.js";
import { useMonProfilQuery, useMesNombreNonLuesQuery } from "../features/moi/hooks.js";

// Espace client final (§ plan rôle USER, Phase 3) — mêmes conventions que
// AppLayout.jsx : 5 destinations principales dans la barre du bas (mobile)
// / les onglets (desktop), les notifications accessibles UNIQUEMENT via la
// cloche de l'en-tête (jamais dans la nav principale, même choix que
// AppLayout — voir NotificationBell), et un tiroir "Plus" pour le reste
// (ici, seulement Reçus — moins consulté que les autres destinations).
const NAV_ITEMS = [
  { label: "Profil", to: "/client", icon: User, end: true },
  { label: "Commandes", to: "/client/commandes", icon: ClipboardList },
  { label: "Mesures", to: "/client/mesures", icon: Ruler },
  { label: "Paiements", to: "/client/paiements", icon: Wallet },
  { label: "Demandes", to: "/client/demandes", icon: Inbox },
];

const DRAWER_ITEMS = [{ label: "Reçus", to: "/client/recus", icon: FileText }];

// `nom`/`logoUrl` viennent de l'atelier DONT LE CLIENT CONNECTÉ EST CLIENT —
// exposés via GET /api/moi (voir moi.routes.js), le seul endpoint accessible
// à un USER : /api/parametres est réservé ADMIN (requireAtelier). Même
// repli que Logo (AppLayout.jsx) tant que non chargé/configuré.
function Logo({ logoUrl, nom }) {
  return (
    <>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt="Logo de l'atelier"
          className="size-8 shrink-0 rounded-lg object-contain bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-800"
        />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow-brand">
          <Scissors className="size-4" aria-hidden="true" />
        </span>
      )}
      <span className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 truncate">
        {nom || "Espace client"}
      </span>
    </>
  );
}

// Pastille = nombre de notifications non lues (fusion des deux sources,
// voir GET /api/moi/notifications/non-lues) — même pattern que la cloche
// ADMIN (NotificationBell, AppLayout.jsx). isPending/isError ignorés
// volontairement : un compteur absent reste un détail décoratif.
function NotificationBell() {
  const { data } = useMesNombreNonLuesQuery();
  const count = data?.count ?? 0;
  return (
    <NavLink
      to="/client/notifications"
      className="relative rounded-lg p-1.5 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      aria-label={count > 0 ? `${count} notifications non lues` : "Notifications"}
    >
      <Bell className="size-4" aria-hidden="true" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-4 h-4 px-0.5 rounded-full bg-red-600 text-white text-[10px] font-semibold leading-none">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </NavLink>
  );
}

export default function ClientLayout() {
  const logoutMutation = useLogoutMutation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // isPending/isError ignorés volontairement : le logo est un détail
  // décoratif, jamais bloquant pour le reste de la mise en page (même
  // logique que Logo dans AppLayout.jsx).
  const profilQuery = useMonProfilQuery();
  const logoUrl = profilQuery.data?.atelier?.logoUrl;
  const nomAtelier = profilQuery.data?.atelier?.nom;

  return (
    <div className="min-h-svh flex flex-col bg-neutral-50 dark:bg-neutral-950">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="md:hidden rounded-lg p-1.5 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
            aria-label="Ouvrir le menu"
          >
            <Menu className="size-4" aria-hidden="true" />
          </button>
          <Logo logoUrl={logoUrl} nom={nomAtelier} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <NotificationBell />
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
        </div>
      </header>

      {/* Onglets desktop — équivalent de la sidebar de AppLayout, en barre
          horizontale (pas assez de destinations pour justifier une sidebar
          dédiée). Reçus y reste présent : la place ne manque pas sur
          desktop, contrairement à la barre du bas mobile ci-dessous. */}
      <nav className="hidden md:flex items-center gap-1 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4">
        {[...NAV_ITEMS, ...DRAWER_ITEMS].map((item) => (
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

      {/* Tiroir mobile "Plus" — même mécanique que AppLayout.jsx (toujours
          monté pour pouvoir animer l'ouverture/fermeture). */}
      <button
        type="button"
        aria-label="Fermer le menu"
        tabIndex={drawerOpen ? 0 : -1}
        onClick={() => setDrawerOpen(false)}
        className={`md:hidden fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        inert={!drawerOpen}
        className={`md:hidden fixed inset-y-0 left-0 z-40 w-[min(68vw,280px)] flex flex-col bg-white dark:bg-neutral-900 shadow-xl transition-transform duration-200 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 px-4 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <Logo logoUrl={logoUrl} nom={nomAtelier} />
        </div>
        <nav className="flex flex-col gap-0.5 p-3">
          {DRAWER_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg border-l-2 pl-2.5 pr-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-brand-600 dark:border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                    : "border-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
                }`
              }
            >
              <item.icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

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
