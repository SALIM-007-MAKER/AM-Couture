// Tarification côté interface (franc CFA, Niger). Les PRIX viennent toujours du serveur (catalogue administré par le SUPERADMIN) :
// ce module ne contient AUCUN tarif, aucun prix par défaut, aucune conversion. Il ne fait que choisir une offre dans une
// formule, et calculer l'économie annuelle INFORMATIVE (mensuel × 12 − annuel), même règle que backend/src/lib/tarifs.js.

/** Périodicités proposées, dans l'ordre d'affichage. 1 mois et 12 mois seulement. */
export const PERIODICITES = ["MENSUEL", "ANNUEL"];

/** L'offre d'une périodicité pour une formule du catalogue (`plan.offres`), ou undefined si la période n'est pas proposée. */
export function offreDe(plan, periodicite) {
  return (plan?.offres ?? []).find((o) => o.periodicite === periodicite);
}

/** Périodicités proposées par au moins une formule, dans l'ordre mensuel puis annuel. */
export function periodesProposees(plans) {
  return PERIODICITES.filter((p) => (plans ?? []).some((plan) => offreDe(plan, p)));
}

/** Prix entier valide (texte saisi ou nombre) : entier de 1 à 99 999 999, sinon null. Le franc CFA n'a pas de centimes. */
export function prixEntier(valeur) {
  if (valeur == null) return null;
  const texte = String(valeur).trim().replace(/[\s  ]/g, "");
  if (!/^\d{1,8}$/.test(texte)) return null;
  const n = Number(texte);
  return n >= 1 ? n : null;
}

/** Économie annuelle informative, à partir de deux prix saisis ou lus (nombres ou textes) ; null sans les deux prix ou sans gain. */
export function economieAnnuelle(mensuel, annuel) {
  const m = prixEntier(mensuel);
  const a = prixEntier(annuel);
  if (m == null || a == null) return null;
  const economie = m * 12 - a;
  return economie > 0 ? economie : null;
}

/** Mois « offerts » par l'annuel (économie ÷ prix mensuel), une décimale ; null sans économie. */
export function moisOfferts(mensuel, annuel) {
  const economie = economieAnnuelle(mensuel, annuel);
  return economie == null ? null : Math.round((economie / prixEntier(mensuel)) * 10) / 10;
}

/** Plus grand nombre de mois offerts parmi les formules (badge du sélecteur de période) ; 0 si aucune économie. */
export function moisOffertsMax(plans) {
  return Math.max(0, ...(plans ?? []).map((p) => p.moisOffertsAnnuel ?? 0));
}

/** Raisons pour lesquelles une formule n'est pas (ou ne peut pas être) proposée, dans un ordre stable, pour l'affichage SuperAdmin. */
export function raisonsNonProposee(plan) {
  const raisons = [];
  if (!plan.actif) raisons.push("INACTIVE");
  if ((plan.offres ?? []).length === 0) raisons.push("AUCUN_TARIF");
  if ((plan.quotasNonDefinis ?? []).length > 0) raisons.push("QUOTAS_NON_DEFINIS");
  return raisons;
}
