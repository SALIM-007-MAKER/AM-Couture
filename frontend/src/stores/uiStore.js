import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * État d'interface partagé, PUREMENT côté client — jamais de donnée métier
 * ici (celle-ci vit dans le cache TanStack Query, toujours dérivée de
 * l'API). `sidebarCollapsed` (mode rail desktop) est la seule préférence
 * persistée (localStorage) : un choix d'affichage, pas une donnée à
 * synchroniser entre appareils — `sidebarOpen` (tiroir mobile), lui, ne doit
 * jamais survivre à un rechargement.
 */
export const useUiStore = create(
  persist(
    (set) => ({
      sidebarOpen: false,
      openSidebar: () => set({ sidebarOpen: true }),
      closeSidebar: () => set({ sidebarOpen: false }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      sidebarCollapsed: false,
      toggleSidebarCollapsed: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: "am-couture-ui",
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);
