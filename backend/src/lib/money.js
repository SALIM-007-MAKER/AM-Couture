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
