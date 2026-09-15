import { useEffect } from "react";
import { useMeQuery } from "../hooks/useAuth.js";
import { useLocaleStore } from "../stores/localeStore.js";
import { LANGUES_TRADUITES } from "../i18n/index.js";

/**
 * Synchronise la langue d'affichage (localeStore) sur la préférence stockée
 * en base (User.langue) une fois connecté — sans ce composant, changer la
 * langue dans "Mon compte" (features/compte/ComptePage.jsx) mettrait à jour
 * la base sans jamais affecter l'interface réellement affichée. Ne fait
 * rien tant que `langue` n'est pas une langue RÉELLEMENT traduite (ex: "ha"
 * pour l'instant) — le store garde alors la dernière langue traduite active
 * plutôt que de retomber silencieusement sur "fr" à chaque rendu.
 * Ne rend rien : composant purement d'effet, monté une fois dans AppLayout.
 */
export default function LocaleSync() {
  const { data: user } = useMeQuery();
  const setLocale = useLocaleStore((s) => s.setLocale);

  useEffect(() => {
    if (user?.langue && LANGUES_TRADUITES.includes(user.langue)) {
      setLocale(user.langue);
    }
  }, [user?.langue, setLocale]);

  return null;
}
