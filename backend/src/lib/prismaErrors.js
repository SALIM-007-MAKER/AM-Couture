/**
 * Détecte une violation de contrainte unique Postgres (P2002) sur un champ
 * donné, en tolérant les DEUX formes observées pour `err.meta` :
 *
 * - forme "classique" (moteur Rust historique) : `meta.target` est un
 *   tableau de noms de colonnes, ex. `["paiementId"]` ;
 * - forme observée avec Prisma 7 + @prisma/adapter-pg (driver adapter) :
 *   `meta.target` est ABSENT ; le nom de la contrainte Postgres se trouve
 *   sous `meta.driverAdapterError.cause.constraint.index`
 *   (ex. "Recu_paiementId_key").
 *
 * Trouvé en testant la concurrence du module Reçus (5 créations simultanées
 * du même reçu-paiement : seule la 1ʳᵉ doit réussir, les autres doivent
 * recevoir un 409 propre) — le code existant (copié depuis le module
 * Livraisons, qui ne teste que `meta.target`) laissait passer une erreur
 * Prisma brute en 500 au lieu du 409 attendu, car ce projet tourne bien en
 * Prisma 7 + adapter-pg. Le même bug latent existait dans livraisons.routes.js
 * (jamais déclenché en pratique : le verrou SELECT...FOR UPDATE y sérialise
 * déjà les tentatives concurrentes AVANT qu'elles n'atteignent l'INSERT,
 * donc ce backstop n'était jamais réellement exercé).
 */
export function isUniqueConstraintViolation(err, fieldName) {
  if (err?.code !== "P2002") return false;

  const target = err?.meta?.target;
  if (Array.isArray(target) && target.includes(fieldName)) return true;
  if (typeof target === "string" && target.includes(fieldName)) return true;

  const constraintIndex = err?.meta?.driverAdapterError?.cause?.constraint?.index;
  if (typeof constraintIndex === "string" && constraintIndex.includes(fieldName)) return true;

  return false;
}
