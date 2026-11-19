// Quotas commerciaux côté interface : liste des ressources et mise en forme. Les RÈGLES (limites en vigueur, plancher,
// refus de création) vivent côté serveur (backend/src/lib/quotas.js) ; ici, uniquement l'affichage.
import { dateLocale } from "../commandes/constants.js";

/** Même liste et même ordre que backend/src/lib/quotas.js (vérifié par quotas.test.js côté frontend). */
export const RESSOURCES = ["clientes", "employes", "commandesActives", "modeles"];

/** Limite lisible : « 1 000 » ou null si illimitée (l'appelant affiche alors « Illimité »). */
export function formaterLimite(valeur) {
  return valeur == null ? null : Number(valeur).toLocaleString(dateLocale());
}
