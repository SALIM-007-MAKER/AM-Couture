import { create } from "zustand";
import { persist } from "zustand/middleware";

// Langue d'AFFICHAGE de l'interface — distincte de User.langue (préférence
// stockée en base, voir features/compte/ComptePage.jsx) : ce store est la
// source de vérité côté client, synchronisée depuis User.langue une fois
// connecté (voir components/LocaleSync.jsx), mais reste utilisable AVANT
// connexion (LoginPage...) via la dernière valeur persistée localement,
// même raisonnement que sidebarCollapsed (stores/uiStore.js).
export const useLocaleStore = create(
  persist(
    (set) => ({
      locale: "fr",
      setLocale: (locale) => set({ locale }),
    }),
    { name: "am-couture-locale" },
  ),
);
