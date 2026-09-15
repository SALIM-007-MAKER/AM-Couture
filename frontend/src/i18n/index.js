import { useLocaleStore } from "../stores/localeStore.js";
import fr from "./fr.js";
import en from "./en.js";

// Langues avec une VRAIE traduction (voir features/compte/constants.js pour
// la liste complète proposée dans le sélecteur, "ha" compris) — une langue
// sélectionnée mais absente d'ici retombe sur le français (voir
// components/LocaleSync.jsx), jamais sur des clés brutes non traduites.
export const DICTIONARIES = { fr, en };
export const LANGUES_TRADUITES = Object.keys(DICTIONARIES);

function resolve(dict, key) {
  return key.split(".").reduce((acc, part) => (acc && typeof acc === "object" ? acc[part] : undefined), dict);
}

function interpolate(str, vars) {
  if (!vars) return str;
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v)), str);
}

/**
 * `t("dashboard.title")` — clé en chemin pointé résolue dans le dictionnaire
 * de la langue courante, repliée sur le français si absente (traduction
 * incomplète), puis sur la clé elle-même en tout dernier recours (jamais un
 * écran vide). `vars` interpole des `{{placeholder}}` dans la chaîne
 * trouvée — pas de pluriel/genre géré au-delà de ça, les quelques cas
 * concernés (ex: "commande(s)") sont écrits directement ainsi dans les deux
 * dictionnaires plutôt que d'ajouter un moteur de règles pour si peu de cas.
 */
export function useTranslation() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  function t(key, vars) {
    const value = resolve(DICTIONARIES[locale], key) ?? resolve(DICTIONARIES.fr, key) ?? key;
    return interpolate(value, vars);
  }

  return { t, locale, setLocale };
}
