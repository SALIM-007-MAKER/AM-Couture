// Systeme de theme clair/sombre - source unique pour :
//  - le script inline de index.html (applique le theme AVANT le premier
//    rendu React, pour eviter un flash du mauvais theme au chargement) ;
//  - stores/themeStore.js (etat React).
//
// Stockage volontairement une simple chaine ("light" | "dark"), pas une
// valeur enveloppee par le middleware persist de Zustand : le script inline
// (JS classique, execute avant tout code applicatif) doit pouvoir la relire
// sans rien connaitre du format interne de Zustand.
export const THEME_STORAGE_KEY = "am-couture-theme";
export const THEMES = ["light", "dark"];

export function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Theme actif : la valeur stockee si valide, sinon la preference systeme au
 * tout premier chargement (repli ponctuel, jamais suivi en direct ensuite -
 * seul un choix explicite Clair/Sombre change le theme par la suite). */
export function getStoredTheme() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (THEMES.includes(value)) return value;
  } catch {
    // localStorage indisponible (navigation privee stricte, etc.) - repli
    // silencieux sur la preference systeme ci-dessous.
  }
  return systemPrefersDark() ? "dark" : "light";
}

export function setStoredTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Meme repli silencieux : le choix ne survivra pas au rechargement,
    // mais l'application reste utilisable pour la session en cours.
  }
}

// Couleurs de la barre systeme/navigateur (meta theme-color) par theme -
// alignees sur le fond de page reel (voir index.css : neutral-50 en clair,
// neutral-950 en sombre), pas une couleur de marque : c'est la couleur
// perçue "hors contenu", elle doit se fondre avec l'app.
const THEME_COLOR_META = { light: "#fafafa", dark: "#0a0a0a" };

/** Pose/retire la classe .dark sur <html> et met a jour le meta theme-color -
 * seule fonction qui touche reellement le DOM, appelee par le script inline
 * ET par themeStore (meme logique, jamais deux implementations qui divergent). */
export function applyTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR_META[theme]);
}
