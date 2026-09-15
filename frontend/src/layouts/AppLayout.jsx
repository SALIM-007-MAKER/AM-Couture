import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Scissors,
  LayoutDashboard,
  Users,
  Shirt,
  ClipboardList,
  Truck,
  Wallet,
  Receipt,
  FileText,
  BarChart3,
  Calendar,
  Bell,
  Settings,
  UserCircle,
  CreditCard,
  Menu,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useMeQuery, useLogoutMutation } from "../hooks/useAuth.js";
import { useParametresQuery } from "../features/parametres/hooks.js";
import { useNombreNonLuesQuery } from "../features/notifications/hooks.js";
import { useUiStore } from "../stores/uiStore.js";
import EmailVerificationBanner from "../components/EmailVerificationBanner.jsx";

// Sidebar groupée par domaine métier — reflète l'organisation réelle de
// l'application, pas une simple liste plate. Tous les modules listés ici
// sont pleinement fonctionnels (plus d'indicateur "bientôt").
const NAV_GROUPS = [
  {
    label: "Principal",
    items: [{ label: "Tableau de bord", to: "/", icon: LayoutDashboard, end: true }],
  },
  {
    label: "Atelier",
    items: [
      { label: "Clients", to: "/clientes", icon: Users },
      { label: "Modèles", to: "/modeles", icon: Shirt },
      { label: "Commandes", to: "/commandes", icon: ClipboardList },
      { label: "Livraisons", to: "/livraisons", icon: Truck },
    ],
  },
  {
    label: "Finances",
    items: [
      { label: "Paiements", to: "/paiements", icon: Wallet },
      { label: "Dépenses", to: "/depenses", icon: Receipt },
      { label: "Reçus", to: "/recus", icon: FileText },
    ],
  },
  {
    label: "Analyse",
    items: [
      { label: "Rapports", to: "/rapports", icon: BarChart3 },
      { label: "Calendrier", to: "/calendrier", icon: Calendar },
    ],
  },
  {
    label: "Configuration",
    items: [
      { label: "Paramètres", to: "/parametres", icon: Settings },
      { label: "Mon compte", to: "/compte", icon: UserCircle },
      { label: "Abonnement", to: "/abonnement", icon: CreditCard },
    ],
  },
];
// "Finances" n'existe pas dans la sidebar desktop (voir NAV_GROUPS
// ci-dessus, inchangée) : sa seule raison d'être est de donner à l'onglet
// "Finances" de la bottom navigation mobile une destination unique en un
// clic (voir BottomNav plus bas et pages/FinancesPage.jsx). Ajoutée ici,
// séparément, uniquement pour que l'en-tête affiche le bon titre de page.
const FINANCES_HUB_ITEM = { label: "Finances", to: "/finances", icon: Wallet };
// Notifications : pas dans la sidebar desktop (accès direct via la cloche de
// l'en-tête, voir plus bas) mais garde un titre de page cohérent — même
// logique que FINANCES_HUB_ITEM ci-dessus.
const NOTIFICATIONS_HUB_ITEM = { label: "Notifications", to: "/notifications", icon: Bell };
const ALL_NAV_ITEMS = [...NAV_GROUPS.flatMap((g) => g.items), FINANCES_HUB_ITEM, NOTIFICATIONS_HUB_ITEM];

function useCurrentNavItem(pathname) {
  return ALL_NAV_ITEMS.find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)));
}

// Contenu du tiroir mobile ("Plus") : uniquement les modules secondaires —
// les 5 destinations principales sont déjà couvertes par la bottom
// navigation (BottomNav), les reproposer ici serait redondant. La sidebar
// desktop, elle, continue d'utiliser NAV_GROUPS au complet (inchangée).
// Pas de `label` de groupe ici : un unique intitulé générique ("Autres
// modules") au-dessus d'une liste plate n'apportait rien — juste les icônes
// et libellés, comme un sous-menu classique.
const MOBILE_DRAWER_GROUPS = [
  {
    key: "secondaire",
    items: [
      { label: "Livraisons", to: "/livraisons", icon: Truck },
      { label: "Reçus", to: "/recus", icon: FileText },
      { label: "Rapports", to: "/rapports", icon: BarChart3 },
      { label: "Calendrier", to: "/calendrier", icon: Calendar },
      { label: "Notifications", to: "/notifications", icon: Bell },
      { label: "Paramètres", to: "/parametres", icon: Settings },
      { label: "Mon compte", to: "/compte", icon: UserCircle },
      { label: "Abonnement", to: "/abonnement", icon: CreditCard },
    ],
  },
];

function NavContent({ collapsed, onNavigate, groups = NAV_GROUPS }) {
  return (
    <nav className="flex flex-col gap-4 p-3">
      {groups.map((group) => (
        <div key={group.key ?? group.label} className="space-y-0.5">
          {!collapsed && group.label && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-600">
              {group.label}
            </p>
          )}
          {group.items.map((item) => (
            <NavLink
              key={item.label}
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
        </div>
      ))}
    </nav>
  );
}

// Les 5 destinations principales, accessibles en un seul clic depuis le bas
// de l'écran sur mobile (< md) — le reste (Livraisons, Reçus, Rapports,
// Paramètres) reste dans le tiroir "Plus" (MOBILE_DRAWER_GROUPS ci-dessus),
// ouvert depuis le hamburger du header. Le libellé "Accueil" (plutôt que
// "Tableau de bord") est volontairement plus court pour rester lisible sur
// un onglet étroit ; le titre affiché dans l'en-tête reste "Tableau de bord"
// (voir ALL_NAV_ITEMS, resté inchangé pour ce chemin).
const BOTTOM_NAV_ITEMS = [
  { label: "Accueil", to: "/", icon: LayoutDashboard, end: true },
  { label: "Clients", to: "/clientes", icon: Users },
  { label: "Modèles", to: "/modeles", icon: Shirt },
  { label: "Commandes", to: "/commandes", icon: ClipboardList },
  FINANCES_HUB_ITEM,
];

function BottomNav() {
  return (
    <nav
      aria-label="Navigation principale"
      className="md:hidden fixed inset-x-0 bottom-0 z-30 flex bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 pb-[env(safe-area-inset-bottom)]"
    >
      {BOTTOM_NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors active:scale-95 ${
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
  );
}

// `nom` vient de l'atelier DE L'UTILISATEUR CONNECTÉ (Phase 8 — multi-tenant :
// jamais un nom d'app codé en dur, chaque atelier a le sien, voir
// useParametresQuery dans AppLayout). Tant que la fiche atelier n'est pas
// encore chargée/configurée, on retombe sur un intitulé générique de
// plateforme plutôt que sur le nom d'un atelier précis.
function Logo({ collapsed, logoUrl, nom }) {
  return (
    <div
      className={`flex items-center gap-2 px-4 py-4 border-b border-neutral-200 dark:border-neutral-800 ${collapsed ? "justify-center px-0" : ""}`}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt="Logo de l'atelier"
          className="size-8 shrink-0 rounded-lg object-contain bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 shadow-glow-brand"
        />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow-brand">
          <Scissors className="size-4" aria-hidden="true" />
        </span>
      )}
      {!collapsed && (
        <span className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 truncate">
          {nom || "Gestion d'Atelier"}
        </span>
      )}
    </div>
  );
}

// Cloche de l'en-tête (Phase 4) — pastille = nombre de notifications non
// lues, rafraîchie toutes les 60s (voir useNombreNonLuesQuery). isPending/
// isError ignorés volontairement : un compteur absent/en erreur reste un
// détail décoratif, jamais bloquant (même logique que le logo ci-dessus).
function NotificationBell() {
  const { data } = useNombreNonLuesQuery();
  const count = data?.count ?? 0;
  return (
    <NavLink
      to="/notifications"
      className="relative rounded-lg p-1.5 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      aria-label={count > 0 ? `${count} notification(s) non lue(s)` : "Notifications"}
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

export default function AppLayout() {
  const { data: user } = useMeQuery();
  const logoutMutation = useLogoutMutation();
  const { sidebarOpen, closeSidebar, toggleSidebar, sidebarCollapsed, toggleSidebarCollapsed } = useUiStore();
  const location = useLocation();
  const currentNavItem = useCurrentNavItem(location.pathname);
  // isPending/isError volontairement ignorés ici : le logo est un détail
  // décoratif de la sidebar, pas une donnée dont l'absence doit bloquer ou
  // dégrader le reste de la mise en page (voir Logo — repli sur l'icône
  // ciseaux tant que rien n'est chargé ou configuré).
  const parametresQuery = useParametresQuery();
  const logoUrl = parametresQuery.data?.logoUrl;
  const nomAtelier = parametresQuery.data?.nom;

  return (
    <div className="min-h-svh flex bg-neutral-50 dark:bg-neutral-950">
      {/* Sidebar desktop — réductible en mode rail (icônes seules). Largeur
          par palier (pas une seule valeur fixe) : compacte sur tablette
          (md, ≥768px), grandit progressivement jusqu'à ~320px sur les très
          grands écrans (2xl, ≥1536px) — un iPad et un écran 27" n'ont pas la
          même largeur disponible pour le contenu principal. */}
      <aside
        className={`hidden md:flex flex-col shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 transition-[width] duration-150 ${
          sidebarCollapsed ? "w-16" : "w-56 lg:w-64 xl:w-72 2xl:w-80"
        }`}
      >
        <Logo collapsed={sidebarCollapsed} logoUrl={logoUrl} nom={nomAtelier} />
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

      {/* Sidebar mobile (tiroir) — toujours montée (plutôt qu'un rendu
          conditionnel qui ferait apparaître/disparaître le tiroir d'un coup)
          pour pouvoir animer l'ouverture/fermeture via transform/opacity. */}
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
        <Logo collapsed={false} logoUrl={logoUrl} nom={nomAtelier} />
        <div className="flex-1 overflow-y-auto">
          <NavContent collapsed={false} onNavigate={closeSidebar} groups={MOBILE_DRAWER_GROUPS} />
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
            <NotificationBell />
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

        <EmailVerificationBanner />

        <main className="flex-1 p-4 sm:p-6 pb-24 md:pb-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
