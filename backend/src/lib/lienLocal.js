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

/**
 * Origine à mettre dans le lien affiché en local. Derrière le proxy Vite (changeOrigin), l'en-tête Host est celui de
 * l'API (ex. :4000) : un lien bâti dessus mènerait à l'API et pas à l'écran. L'en-tête Origin, lui, est celui de la page
 * (ex. :5173). On l'utilise seulement en mode local, seulement vers localhost, et jamais si PUBLIC_APP_URL est défini.
 */
export function origineLienLocal(origineHeader, repli, env = process.env) {
  if (!modeEmailLocal(env) || env.PUBLIC_APP_URL) return repli;
  try {
    const u = new URL(origineHeader);
    if (["localhost", "127.0.0.1"].includes(u.hostname) && u.protocol === "http:") return u.origin;
  } catch {
    // En-tête absent ou invalide : on garde l'origine déduite de la requête.
  }
  return repli;
}
