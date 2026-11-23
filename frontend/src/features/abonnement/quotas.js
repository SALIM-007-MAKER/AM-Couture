// Quotas commerciaux côté interface : liste des ressources et mise en forme. Les RÈGLES (limites en vigueur, plancher,
// refus de création) vivent côté serveur (backend/src/lib/quotas.js) ; ici, uniquement l'affichage.
import { dateLocale } from "../commandes/constants.js";

/** Même liste et même ordre que backend/src/lib/quotas.js (vérifié par quotas.test.js côté frontend). */
export const RESSOURCES = ["clientes", "employes", "commandesActives", "modeles"];

/** Limite lisible : « 1 000 » ou null si illimitée (l'appelant affiche alors « Illimité »). */
export function formaterLimite(valeur) {
  return valeur == null ? null : Number(valeur).toLocaleString(dateLocale());
}

/** Part de la limite consommée, de 0 à 100 (une ressource au-dessus de sa limite affiche une barre pleine). */
export function pourcentage(usage, limite) {
  if (!limite) return 0;
  return Math.max(0, Math.min(100, Math.round((usage / limite) * 100)));
}

/** Couleurs d'une jauge selon son état (mêmes teintes que le reste de l'interface : neutre, orange, rouge). */
export function teintesJauge(etat) {
  switch (etat) {
    case "depasse":
    case "atteint":
      return { barre: "bg-red-500 dark:bg-red-400", texte: "text-red-700 dark:text-red-400" };
    case "proche":
      return { barre: "bg-amber-500 dark:bg-amber-400", texte: "text-amber-700 dark:text-amber-400" };
    case "illimite":
      return { barre: "bg-neutral-400", texte: "text-neutral-500" };
    default:
      return { barre: "bg-brand-500 dark:bg-brand-400", texte: "text-neutral-500" };
  }
}

/**
 * Message traduit d'un refus de quota (409 avec details.quota = { ressource, limite, usage }), ou null si l'erreur n'en est
 * pas un. `erreur` : n'importe quelle erreur ; `t` : fonction de traduction.
 */
export function messageQuota(erreur, t) {
  const q = erreur?.details?.quota;
  if (erreur?.status !== 409 || !q || !RESSOURCES.includes(q.ressource)) return null;
  return t(`quotas.atteint.${q.ressource}`, { limite: formaterLimite(q.limite) ?? q.limite, usage: formaterLimite(q.usage) ?? q.usage });
}
