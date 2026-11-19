// TARIFICATION des formules — règles PURES (aucun accès à la base). Niger uniquement : franc CFA BCEAO (XOF), affiché « FCFA ».
//
// Principes :
//  - les prix sont ADMINISTRÉS par le SUPERADMIN dans le catalogue (PlanAbonnement.prixMensuel / prixAnnuel) : aucun prix n'est
//    écrit ici, aucun prix par défaut n'existe, aucun taux de change ;
//  - deux périodicités seulement pour les nouvelles souscriptions : mensuelle (1 mois) et annuelle (12 mois) ; chacune n'est
//    PROPOSÉE que si son prix est configuré (entier strictement positif) ;
//  - une formule sans aucune offre n'est pas proposée aux ateliers ;
//  - l'économie annuelle (mensuel × 12 − annuel) est purement INFORMATIVE : elle n'est jamais enregistrée ni appliquée ;
//  - les anciennes durées (3, 6 mois, remises) restent valables pour les contrats existants (prix et durée figés dans
//    Abonnement) mais ne sont plus proposées.
import { RESSOURCES, normaliserLimites } from "./quotas.js";

export const PAYS = "NE";
export const DEVISE = "XOF";
export const PRIX_MIN = 1;
export const PRIX_MAX = 99_999_999;

export const PERIODICITES = {
  MENSUEL: { cle: "MENSUEL", dureeMois: 1, champPrix: "prixMensuel" },
  ANNUEL: { cle: "ANNUEL", dureeMois: 12, champPrix: "prixAnnuel" },
};

/** Valeur numérique d'un prix (nombre, texte ou Decimal Prisma) ; null si absent. */
function nombre(valeur) {
  if (valeur == null) return null;
  const n = Number(typeof valeur === "object" ? valeur.toString() : valeur);
  return Number.isFinite(n) ? n : null;
}

/** Un prix est valide s'il est un entier de PRIX_MIN à PRIX_MAX (le XOF n'a pas de centimes). */
export function estPrixValide(valeur) {
  const n = nombre(valeur);
  return n != null && Number.isInteger(n) && n >= PRIX_MIN && n <= PRIX_MAX;
}

/** Offres du catalogue : une par période dont le prix est configuré et valide. Ordre : mensuelle puis annuelle. */
export function offres(plan) {
  const sortie = [];
  for (const p of Object.values(PERIODICITES)) {
    const prix = nombre(plan?.[p.champPrix]);
    if (estPrixValide(prix)) sortie.push({ periodicite: p.cle, dureeMois: p.dureeMois, prix, devise: DEVISE });
  }
  return sortie;
}

/** L'offre d'une durée en mois (1 ou 12), ou null si cette période n'est pas proposée pour la formule. */
export function offrePourDuree(plan, dureeMois) {
  return offres(plan).find((o) => o.dureeMois === dureeMois) ?? null;
}

/** Périodicité (MENSUEL / ANNUEL) correspondant à une durée de 1 ou 12 mois, sinon null. */
export function periodiciteDeDuree(dureeMois) {
  return Object.values(PERIODICITES).find((p) => p.dureeMois === dureeMois)?.cle ?? null;
}

/** Économie annuelle INFORMATIVE : prix mensuel × 12 − prix annuel. null si un des prix manque ou si elle n'est pas positive. */
export function economieAnnuelle(plan) {
  const mensuel = nombre(plan?.prixMensuel);
  const annuel = nombre(plan?.prixAnnuel);
  if (!estPrixValide(mensuel) || !estPrixValide(annuel)) return null;
  const economie = mensuel * 12 - annuel;
  return economie > 0 ? economie : null;
}

/** Nombre de mois « offerts » par l'annuel (économie ÷ prix mensuel), arrondi à une décimale ; null sans économie. */
export function moisOffertsAnnuel(plan) {
  const economie = economieAnnuelle(plan);
  return economie == null ? null : Math.round((economie / nombre(plan.prixMensuel)) * 10) / 10;
}

/**
 * Les QUOTAS sont-ils DÉFINIS ? Oui si chacune des quatre ressources est explicitement décidée : une limite (entier valide) ou
 * « illimité explicite » (null). Une clé ABSENTE est « non définie » : elle n'est jamais traitée comme illimitée pour décider
 * qu'une formule peut être proposée (le moteur de quotas, lui, lit une clé absente comme illimitée).
 */
export function quotasDefinis(limites) {
  if (!limites || typeof limites !== "object" || Array.isArray(limites)) return false;
  const valides = normaliserLimites(limites);
  return RESSOURCES.every((cle) => (cle in limites && limites[cle] === null) || cle in valides);
}

/** Ressources dont la limite n'est pas encore décidée (clé absente). */
export function quotasNonDefinis(limites) {
  const l = limites && typeof limites === "object" && !Array.isArray(limites) ? limites : {};
  const valides = normaliserLimites(l);
  return RESSOURCES.filter((cle) => !((cle in l && l[cle] === null) || cle in valides));
}

/** Une formule est PROPOSÉE aux ateliers si elle est active et a au moins une offre. */
export function estProposee(plan) {
  return Boolean(plan?.actif) && offres(plan).length > 0;
}

/**
 * Peut-on ACTIVER commercialement la formule ? Il faut au moins une offre valide ET des quotas définis (jamais d'illimité par
 * défaut). Renvoie { ok, raisons } avec raisons ⊂ { "AUCUN_TARIF", "QUOTAS_NON_DEFINIS" }.
 */
export function verifierActivation(plan) {
  const raisons = [];
  if (offres(plan).length === 0) raisons.push("AUCUN_TARIF");
  if (!quotasDefinis(plan?.limites)) raisons.push("QUOTAS_NON_DEFINIS");
  return { ok: raisons.length === 0, raisons };
}

/** Ancien format `tarifs` (durée, remise, total) dérivé des offres, pour les écrans qui ne connaissent pas encore `offres`. */
export function tarifsAncienFormat(plan) {
  return offres(plan).map((o) => ({ dureeMois: o.dureeMois, remisePourcent: 0, total: o.prix }));
}
