// QUOTAS COMMERCIAUX — partie SERVEUR : comptage de l'usage, verrous et contrôle avant création. Les règles pures sont dans
// quotas.js. Tout se passe dans la transaction de la création, SOUS UN VERROU CONSULTATIF par atelier et par ressource :
// deux créations simultanées passent l'une après l'autre, la seconde voit la première et se fait refuser proprement.
//
// ORDRE DES VERROUS (pour éviter tout interblocage) : le verrou de quota d'abord, puis les verrous métier existants
// (téléphone d'une cliente, nom d'un modèle, compteur de numéros). Quand plusieurs quotas sont pris ensemble
// (activation d'un abonnement), ils le sont toujours dans l'ordre de RESSOURCES_TRIEES.
import { HttpError } from "../middlewares/error.middleware.js";
import { verrouillerCle } from "./verrous.js";
import { STATUTS_OUVERTS } from "./production.js";
import { RESSOURCES, limitesApplicables, peutAjouter, figerLimites, estEligiblePlancher, jauges } from "./quotas.js";

const RESSOURCES_TRIEES = [...RESSOURCES].sort();

export const cleVerrouQuota = (atelierId, ressource) => `quota:${atelierId}:${ressource}`;

/**
 * Usage réel d'une ressource :
 *  - clientes : fiches non archivées (une fiche anonymisée est archivée : elle ne compte pas) ;
 *  - employes : comptes EMPLOYE actifs (ni le PDG, ni les comptes clientes, ni les employés désactivés) ;
 *  - commandesActives : commandes ni livrées ni annulées (STATUTS_OUVERTS, TERMINEE comprise) ;
 *  - modeles : modèles non archivés.
 * Les plafonds techniques (8 photos par modèle…) sont indépendants et ne passent pas par ici.
 */
export async function compterUsage(tx, atelierId, ressource) {
  switch (ressource) {
    case "clientes":
      return tx.cliente.count({ where: { atelierId, archivedAt: null } });
    case "employes":
      return tx.user.count({ where: { atelierId, role: "EMPLOYE", actif: true } });
    case "commandesActives":
      return tx.commande.count({ where: { atelierId, statut: { in: STATUTS_OUVERTS } } });
    case "modeles":
      return tx.modele.count({ where: { atelierId, archivedAt: null } });
    default:
      throw new Error(`Ressource de quota inconnue : ${ressource}`);
  }
}

/** Usage des quatre ressources. */
export async function usageComplet(tx, atelierId) {
  const valeurs = await Promise.all(RESSOURCES.map((r) => compterUsage(tx, atelierId, r)));
  return Object.fromEntries(RESSOURCES.map((r, i) => [r, valeurs[i]]));
}

/** Prend le verrou de quota d'une ressource (libéré à la fin de la transaction). */
export async function verrouillerQuota(tx, atelierId, ressource) {
  await verrouillerCle(tx, cleVerrouQuota(atelierId, ressource));
}

/** Prend les verrous des quatre quotas, toujours dans le même ordre. */
export async function verrouillerTousLesQuotas(tx, atelierId) {
  for (const ressource of RESSOURCES_TRIEES) await verrouillerQuota(tx, atelierId, ressource);
}

/** Limites en vigueur de l'atelier (voir limitesApplicables) : essai, abonnement actif, grâce, suspension. */
export async function limitesEnVigueur(tx, atelierId, now = new Date()) {
  const [atelier, abonnements] = await Promise.all([
    tx.atelier.findUnique({ where: { id: atelierId }, select: { trialEndsAt: true } }),
    tx.abonnement.findMany({
      where: { atelierId, statut: { in: ["CONFIRME", "SUSPENDU"] } },
      select: { statut: true, dateDebut: true, dateExpiration: true, limites: true, plancher: true },
    }),
  ]);
  return { ...limitesApplicables({ trialEndsAt: atelier?.trialEndsAt ?? null }, abonnements, now), abonnements };
}

/**
 * Refuse (409, details.quota) si l'ajout de `ajout` éléments dépasserait la limite en vigueur. À appeler APRÈS
 * verrouillerQuota, juste avant la création, dans la même transaction. Sans quota applicable, ne fait rien.
 * Une ressource déjà au-dessus de sa limite (plancher, formule changée) n'est jamais touchée : seule la création est refusée.
 */
export async function verifierQuota(tx, { atelierId, ressource, ajout = 1 }, now = new Date()) {
  const { limites } = await limitesEnVigueur(tx, atelierId, now);
  const limite = limites?.[ressource];
  if (limite == null) return;
  const usage = await compterUsage(tx, atelierId, ressource);
  if (!peutAjouter(usage, limite, ajout)) {
    throw new HttpError(
      409,
      `Quota atteint : votre formule limite cette ressource à ${limite} (${usage} en cours).`,
      { quota: { ressource, limite, usage } },
    );
  }
}

/** Verrou + contrôle, pour les routes qui n'ont aucun autre contrôle à intercaler. */
export async function exigerQuota(tx, args, now) {
  await verrouillerQuota(tx, args.atelierId, args.ressource);
  await verifierQuota(tx, args, now);
}

/**
 * Limites à figer dans un abonnement qu'on ACTIVE (confirmation d'un paiement, activation manuelle).
 * `limitesFormule` : limites de la formule à figer. `exclureAbonnementId` : l'abonnement qu'on active (ses pairs seuls comptent).
 * Si l'atelier est ancien et n'a jamais eu d'abonnement activé, son usage réel est mesuré SOUS LES QUATRE VERROUS : c'est le
 * plancher d'usage. Sinon le plancher des abonnements précédents est reporté, sans nouvelle mesure.
 */
export async function calculerFigeage(tx, { atelierId, limitesFormule, exclureAbonnementId = null }) {
  const [atelier, autres] = await Promise.all([
    tx.atelier.findUnique({ where: { id: atelierId }, select: { trialEndsAt: true } }),
    tx.abonnement.findMany({
      where: { atelierId, ...(exclureAbonnementId ? { id: { not: exclureAbonnementId } } : {}) },
      select: { dateDebut: true, plancher: true },
    }),
  ]);
  let usages = null;
  if (estEligiblePlancher(atelier ?? { trialEndsAt: null }, autres)) {
    await verrouillerTousLesQuotas(tx, atelierId);
    usages = await usageComplet(tx, atelierId);
  }
  return figerLimites({ limitesFormule, atelier: atelier ?? { trialEndsAt: null }, autres, usages });
}

/** Utilisation d'un atelier : une jauge par ressource, avec la raison pour laquelle les quotas s'appliquent (ou non). */
export async function utilisationAtelier(db, atelierId, now = new Date()) {
  const { limites, raison, abonnement, abonnements } = await limitesEnVigueur(db, atelierId, now);
  const usages = await usageComplet(db, atelierId);
  const plancher = abonnement?.plancher ?? {};
  return {
    quotasAppliques: limites != null,
    raison,
    jauges: jauges(usages, limites, plancher),
    abonnementsPrisEnCompte: abonnements.length,
  };
}
