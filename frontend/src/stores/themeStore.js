import { create } from "zustand";
import { getStoredTheme, setStoredTheme, applyTheme } from "../lib/theme.js";

/**
 * Préférence de thème (clair/sombre) - persistée manuellement via
 * lib/theme.js (pas le middleware `persist` de Zustand : le script inline de
 * index.html, qui applique le thème avant le premier rendu pour éviter un
 * flash, doit lire exactement le même format simple de localStorage sans
 * connaître l'enveloppe JSON que `persist` y ajouterait).
 */
export const useThemeStore = create((set) => ({
  theme: getStoredTheme(),

  setTheme: (theme) => {
    setStoredTheme(theme);
    applyTheme(theme);
    set({ theme });
  },
}));
