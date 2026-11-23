// Règle de synchronisation « langue du compte -> langue d'affichage » (voir components/LocaleSync.jsx), isolée pour être testée.
//
// Pourquoi : App.jsx remonte tout l'arbre des routes (key={locale}) à chaque changement de langue, donc LocaleSync est remonté lui
// aussi. S'il réappliquait la langue du compte à chaque montage, le bouton FR/EN de l'en-tête (qui ne change que la langue locale)
// était annulé aussitôt : clic sur EN -> remontée -> la langue du compte (FR) était remise.
//
// La langue du compte n'est donc appliquée que lorsqu'elle est NOUVELLE pour cet utilisateur : au premier chargement, ou quand elle
// change réellement (page « Mon compte », ou enregistrement après un clic sur le bouton de l'en-tête).

/** Clé identifiant « cet utilisateur avec cette langue de compte ». */
export function cleSynchro(user) {
  return user?.langue ? `${user.id ?? ""}:${user.langue}` : null;
}

/**
 * Langue à appliquer à l'affichage, ou null s'il n'y a rien à faire.
 * @param {string|null} derniereCle  clé déjà appliquée (conservée hors composant, donc au-delà des remontées)
 * @param {object|undefined} user    utilisateur courant (GET /me)
 * @param {string[]} traduites       langues réellement traduites
 */
export function langueAAppliquer(derniereCle, user, traduites) {
  const cle = cleSynchro(user);
  if (!cle || cle === derniereCle) return null;
  return traduites.includes(user.langue) ? { langue: user.langue, cle } : null;
}
