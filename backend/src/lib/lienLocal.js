// Réinitialisation du mot de passe sans service d'emails, EN DÉVELOPPEMENT LOCAL SEULEMENT.
//
// Le lien n'est jamais renvoyé dans la réponse HTTP : il est écrit dans la sortie du terminal du backend, que seul le
// développeur voit. La réponse reste identique à celle de la production (anti-énumération, voir auth.routes.js).
//
// Le mode local est une liste d'autorisation stricte : il faut NODE_ENV exactement égal à « development », aucune clé
// Resend configurée et aucune variable VERCEL. Toute autre situation (production, test, variable absente) garde
// l'envoi par Resend, avec son échec explicite si la clé manque.

/** Vrai uniquement sur un poste de développement sans clé Resend. Pure : l'environnement est un paramètre. */
export function modeEmailLocal(env = process.env) {
  return env.NODE_ENV === "development" && !env.RESEND_API_KEY && !env.VERCEL;
}

/** Écrit le lien dans le terminal du développeur. Jamais dans le logger JSON (qui exclut jetons et emails). */
export function afficherLienLocal({ libelle, identifiant, lien }, sortie = console.log) {
  sortie(`\n[DEV LOCAL] ${libelle} pour « ${identifiant} » (aucun email envoyé) :\n${lien}\n`);
}
