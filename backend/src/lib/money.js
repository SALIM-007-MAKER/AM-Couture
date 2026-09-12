import { Prisma } from "../generated/prisma/client.ts";

// Arithmétique décimale exacte (decimal.js, la même lib que Prisma utilise
// en interne pour ses colonnes Decimal) — jamais de flottant JS pour sommer
// des montants : une somme de nombreux paiements en `Number` accumulerait
// une erreur d'arrondi. Le solde est TOUJOURS recalculé à la volée à partir
// de prixTotal et des paiements réels, jamais stocké (pas de champ "acompte").

export function sumDecimal(values) {
  return values.reduce((acc, v) => acc.plus(v), new Prisma.Decimal(0));
}

/**
 * IMPORTANT depuis l'ajout de l'annulation de paiement (Paiement.annuleAt) :
 * cette fonction somme EXACTEMENT le tableau qu'on lui passe, sans filtrer
 * quoi que ce soit elle-même. Tout appelant qui a récupéré des paiements
 * incluant potentiellement des lignes annulées (ex: l'historique complet
 * affiché sur la fiche commande) DOIT filtrer `paiements.filter(p =>
 * !p.annuleAt)` avant d'appeler computeSolde — un paiement annulé ne compte
 * jamais dans le solde.
 * @returns {{ totalPaye: string, solde: string }}
 */
export function computeSolde(prixTotal, paiements) {
  const totalPaye = sumDecimal(paiements.map((p) => p.montant));
  const solde = new Prisma.Decimal(prixTotal).minus(totalPaye);
  return { totalPaye: totalPaye.toString(), solde: solde.toString() };
}

/**
 * Statut de paiement dérivé — jamais stocké, recalculé à chaque lecture à
 * partir de prixTotal/totalPaye (mêmes valeurs déjà produites par
 * computeSolde ci-dessus), exactement dans le même esprit que le solde
 * lui-même. Accepte des chaînes ou des Decimal indifféremment (les deux
 * circulent selon l'appelant : chaîne côté API déjà sérialisée, Decimal côté
 * calcul interne).
 */
export function statutPaiement(prixTotal, totalPaye) {
  const paye = new Prisma.Decimal(totalPaye);
  if (paye.lessThanOrEqualTo(0)) return "NON_PAYE";
  if (paye.lessThan(new Prisma.Decimal(prixTotal))) return "PARTIELLEMENT_PAYE";
  return "PAYE";
}
