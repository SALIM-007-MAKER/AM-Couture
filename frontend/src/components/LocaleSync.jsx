import { useEffect } from "react";
import { useMeQuery } from "../hooks/useAuth.js";
import { useLocaleStore } from "../stores/localeStore.js";
import { LANGUES_TRADUITES } from "../i18n/index.js";
import { langueAAppliquer } from "../lib/synchroLangue.js";

// Dernière langue de compte déjà appliquée (« id:langue »). Hors composant : App.jsx remonte les routes à chaque changement de
// langue (key={locale}), ce qui remonte aussi LocaleSync ; une valeur gardée dans le composant serait perdue à chaque remontée.
let derniereCle = null;

/**
 * Synchronise la langue d'affichage (localeStore) sur la préférence stockée
 * en base (User.langue) une fois connecté — sans ce composant, changer la
 * langue dans "Mon compte" (features/compte/ComptePage.jsx) mettrait à jour
 * la base sans jamais affecter l'interface réellement affichée. Ne fait
 * rien tant que `langue` n'est pas une langue RÉELLEMENT traduite (ex: une langue retirée
 * pour l'instant) — le store garde alors la dernière langue traduite active
 * plutôt que de retomber silencieusement sur "fr" à chaque rendu.
 *
 * La langue du compte n'est appliquée qu'une fois par valeur (voir lib/synchroLangue.js) : sinon le bouton FR/EN de l'en-tête,
 * qui change la langue locale, était annulé à la remontée des routes par la langue (inchangée) du compte.
 * Ne rend rien : composant purement d'effet, monté une fois dans AppLayout.
 */
export default function LocaleSync() {
  const { data: user } = useMeQuery();
  const setLocale = useLocaleStore((s) => s.setLocale);

  useEffect(() => {
    const aAppliquer = langueAAppliquer(derniereCle, user, LANGUES_TRADUITES);
    if (aAppliquer) {
      derniereCle = aAppliquer.cle;
      setLocale(aAppliquer.langue);
    }
  }, [user, setLocale]);

  return null;
}
