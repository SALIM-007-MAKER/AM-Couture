import { HttpError } from "../middlewares/error.middleware.js";

/**
 * Verrou de ligne sur une commande (`SELECT … FOR UPDATE`), à prendre en PREMIER dans toute
 * transaction qui lit ou écrit les paiements, livraisons ou reçus de cette commande.
 *
 * Toutes les écritures financières d'une commande se sérialisent ainsi sur le même verrou : création
 * de paiement, livraison avec paiement final, ANNULATION de paiement, émission de reçu. Sans ce verrou
 * commun, une annulation (qui vérifie « pas de reçu ») et une émission de reçu (qui vérifie « pas
 * annulé ») pouvaient réussir toutes les deux (anomalie 1, docs/INVARIANTS.md).
 *
 * Ordre de verrouillage unique (la commande d'abord, jamais l'inverse) : aucun interblocage possible
 * entre ces opérations.
 */
export async function verrouillerCommande(tx, commandeId) {
  const lignes = await tx.$queryRaw`SELECT id FROM "Commande" WHERE id = ${commandeId} FOR UPDATE`;
  if (lignes.length === 0) throw new HttpError(404, "Commande introuvable.");
}

/**
 * Verrou consultatif transactionnel sur une CLÉ MÉTIER (ex. « cliente:<atelier>:<téléphone> »).
 * Sérialise les créations qui visent la même clé alors qu'aucune contrainte UNIQUE n'existe en base
 * (téléphone d'une cliente, nom d'un modèle) : la seconde attend la fin de la première, puis voit sa
 * ligne et refuse proprement. Libéré automatiquement à la fin de la transaction.
 */
export async function verrouillerCle(tx, cle) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${cle}, 0))`;
}
