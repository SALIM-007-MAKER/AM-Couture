// Souscription et paiements d'abonnement : TOUTE la logique d'écriture financière de l'abonnement est ici, appelée
// depuis les routes (atelier et SUPERADMIN) avec un client de transaction. Les routes ne touchent jamais directement
// aux statuts de Transaction / Abonnement.
//
// Principes :
//  - le montant et la durée viennent du plan, calculés par le serveur ; rien de ce que l'atelier envoie ne fixe un prix ;
//  - une transaction ne devient REUSSIE que par une décision du SUPERADMIN (paiement manuel) ou, plus tard, par
//    Wave après relecture serveur : jamais sur la déclaration de l'atelier ;
//  - chaque opération est sérialisée par atelier (verrou consultatif) puis par ligne de transaction (FOR UPDATE) :
//    deux confirmations simultanées ne peuvent pas activer deux fois ni chaîner deux abonnements sur la même date ;
//  - rejouer une décision déjà prise renvoie le résultat existant sans rien refaire (idempotence naturelle) ;
//  - aucune ligne n'est supprimée : tout changement est un changement d'état daté, signé, avec motif, et laisse une
//    entrée d'historique.
import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../middlewares/error.middleware.js";
import { nextNumero } from "./numero.js";
import { verrouillerCle } from "./verrous.js";
import { normaliserLimites } from "./quotas.js";
import { calculerFigeage } from "./quotasServeur.js";
import { calculerDateExpiration, dateDebutSouscription } from "./abonnement.js";
import { offrePourDuree, DEVISE } from "./tarifs.js";

export const cleVerrouAtelier = (atelierId) => `abonnement:${atelierId}`;

async function verrouillerTransaction(tx, id) {
  const lignes = await tx.$queryRaw`SELECT id FROM "Transaction" WHERE id = ${id} FOR UPDATE`;
  if (lignes.length === 0) throw new HttpError(404, "Transaction introuvable.");
}

export function historiser(tx, { abonnement, action, par, note }) {
  return tx.historiqueAbonnement.create({
    data: {
      atelierId: abonnement.atelierId,
      abonnementId: abonnement.id,
      action,
      planNom: abonnement.planNom,
      dureeMois: abonnement.dureeMois,
      dateDebut: abonnement.dateDebut,
      dateExpiration: abonnement.dateExpiration,
      par,
      note,
    },
  });
}

/** Lit la transaction (hors verrou) pour connaître son atelier, puis prend les verrous dans l'ordre unique atelier puis ligne. */
export async function chargerEtVerrouiller(tx, transactionId, { atelierId } = {}) {
  const apercu = await tx.transaction.findUnique({ where: { id: transactionId }, select: { id: true, atelierId: true } });
  if (!apercu || (atelierId && apercu.atelierId !== atelierId)) throw new HttpError(404, "Transaction introuvable.");
  await verrouillerCle(tx, cleVerrouAtelier(apercu.atelierId));
  await verrouillerTransaction(tx, transactionId);
  // Relue APRÈS les verrous : seul l'état lu sous verrou fait foi.
  return tx.transaction.findUnique({ where: { id: transactionId }, include: { abonnement: true, facture: true } });
}

/** Création d'une souscription : abonnement EN_ATTENTE + transaction EN_ATTENTE déclarée par l'atelier. */
export async function souscrire(
  tx,
  { atelier, plan, dureeMois, moyenPaiement, operateur, reference, preuveNote, par },
  now = new Date(),
) {
  await verrouillerCle(tx, cleVerrouAtelier(atelier.id));

  // Seules les périodicités mensuelle (1 mois) et annuelle (12 mois) sont proposées, et seulement si le prix de la période est
  // configuré dans le catalogue : aucun prix par défaut, aucune formule gratuite. Le prix lu ICI (au moment de la déclaration)
  // est figé dans l'abonnement et la transaction : une modification ultérieure du catalogue ne les change jamais.
  const offre = offrePourDuree(plan, dureeMois);
  if (!offre) {
    throw new HttpError(400, "Champs invalides.", { dureeMois: ["Cette période n'est pas proposée pour cette formule."] });
  }
  const montant = new Prisma.Decimal(offre.prix);
  const enAttente = await tx.transaction.findFirst({
    where: { atelierId: atelier.id, statut: "EN_ATTENTE" },
    select: { numero: true },
  });
  if (enAttente) {
    throw new HttpError(
      409,
      "Un paiement est déjà en attente de confirmation. Attendez sa validation ou annulez-le avant d'en déclarer un autre.",
      { transaction: enAttente.numero },
    );
  }

  const abonnement = await tx.abonnement.create({
    data: {
      numero: await nextNumero(tx, "ABN"),
      atelierId: atelier.id,
      planId: plan.id,
      planNom: plan.nom,
      dureeMois,
      prix: montant,
      // Limites de la formule figées dès la déclaration, comme le prix ; le plancher d'usage et les limites effectives sont
      // calculés à l'ACTIVATION (confirmerTransaction).
      limites: normaliserLimites(plan.limites),
      statut: "EN_ATTENTE",
      creePar: par,
    },
  });
  const transaction = await tx.transaction.create({
    data: {
      numero: await nextNumero(tx, "TRX"),
      abonnementId: abonnement.id,
      atelierId: atelier.id,
      moyenPaiement,
      montant,
      devise: DEVISE,
      statut: "EN_ATTENTE",
      // Clé de rapprochement unique ; préfixe WAV- pour un paiement Wave (envoyée à Wave comme client_reference).
      referenceInterne: `${moyenPaiement === "WAVE" ? "WAV" : "MAN"}-${randomUUID()}`,
      referenceExterne: reference ?? null,
      operateur: operateur ?? null,
      preuveNote: preuveNote ?? null,
      declarePar: par,
      declareLe: now,
    },
  });
  await historiser(tx, {
    abonnement,
    action: "SOUSCRIPTION",
    par,
    note: `Paiement déclaré ${transaction.numero} (${moyenPaiement})`,
  });
  return { abonnement, transaction };
}

/** L'atelier retire sa propre déclaration tant qu'elle n'est pas tranchée. */
export async function annulerParAtelier(tx, { transactionId, atelierId, par }) {
  const t = await chargerEtVerrouiller(tx, transactionId, { atelierId });
  if (t.statut === "ANNULEE") return { transaction: t, deja: true };
  if (t.statut !== "EN_ATTENTE") throw new HttpError(409, "Ce paiement a déjà été traité : il ne peut plus être annulé.");
  const transaction = await tx.transaction.update({ where: { id: t.id }, data: { statut: "ANNULEE" } });
  const abonnement = await tx.abonnement.update({ where: { id: t.abonnementId }, data: { statut: "ANNULE" } });
  await historiser(tx, { abonnement, action: "DESACTIVATION", par, note: `Déclaration ${t.numero} annulée par l'atelier` });
  return { transaction, abonnement, deja: false };
}

/** Confirmation par le SUPERADMIN : active l'abonnement et émet la facture, une seule fois. */
export async function confirmerTransaction(tx, { transactionId, par, note, atelierNom, automatique = false }, now = new Date()) {
  const t = await chargerEtVerrouiller(tx, transactionId);
  if (t.statut === "REUSSIE") return { transaction: t, abonnement: t.abonnement, facture: t.facture, deja: true };
  if (t.statut !== "EN_ATTENTE") throw new HttpError(409, "Seul un paiement en attente peut être confirmé.");
  // Un paiement Wave n'est confirmé que par le traitement automatique (lib/paiementEnLigne.js), après relecture de la
  // session chez Wave : jamais à la main, ce qui reviendrait à croire une déclaration.
  if (t.moyenPaiement === "WAVE" && !automatique) {
    throw new HttpError(409, "Un paiement Wave est confirmé automatiquement par Wave, pas manuellement.");
  }

  // Les autres abonnements de l'atelier (lus sous le verrou d'atelier) fixent le début : à l'échéance en cours si
  // elle existe, sinon maintenant. Deux confirmations ne peuvent pas lire la même situation : elles sont sérialisées.
  const autres = await tx.abonnement.findMany({
    where: { atelierId: t.atelierId, statut: "CONFIRME", id: { not: t.abonnementId } },
    select: { statut: true, dateExpiration: true },
  });
  const dateDebut = dateDebutSouscription(autres, now);
  const dateExpiration = calculerDateExpiration(dateDebut, t.abonnement.dureeMois);

  // Quotas figés à l'activation : limites de la formule relevées par le plancher d'usage (atelier ancien, première activation)
  // ou plancher reporté des abonnements précédents. Voir lib/quotas.js.
  const { limites, plancher } = await calculerFigeage(tx, {
    atelierId: t.atelierId,
    limitesFormule: t.abonnement.limites,
    exclureAbonnementId: t.abonnementId,
  });
  const abonnement = await tx.abonnement.update({
    where: { id: t.abonnementId },
    data: { statut: "CONFIRME", dateDebut, dateExpiration, limites, plancher },
  });
  const transaction = await tx.transaction.update({
    where: { id: t.id },
    data: { statut: "REUSSIE", confirmeManuellement: !automatique, confirmePar: par, confirmeLe: now },
  });
  const facture = await tx.factureAbonnement.create({
    data: {
      numero: await nextNumero(tx, "FAC"),
      transactionId: t.id,
      abonnementId: abonnement.id,
      atelierId: t.atelierId,
      atelierNom,
      planNom: abonnement.planNom,
      dureeMois: abonnement.dureeMois,
      periodeDebut: dateDebut,
      periodeFin: dateExpiration,
      montant: t.montant,
      moyenPaiement: t.moyenPaiement,
      referencePaiement: t.referenceExterne,
      emisLe: now,
    },
  });
  await historiser(tx, {
    abonnement,
    action: "CONFIRMATION_PAIEMENT",
    par,
    note: note ?? `Paiement ${t.numero} confirmé, facture ${facture.numero}`,
  });
  return { transaction, abonnement, facture, deja: false };
}

/** Clôture une transaction en ligne restée sans issue (session expirée, jamais créée) : aucun accès accordé. */
export async function expirerTransaction(tx, { transactionId, motif, par = "systeme" }) {
  const t = await chargerEtVerrouiller(tx, transactionId);
  if (t.statut !== "EN_ATTENTE") return { transaction: t, deja: true };
  const transaction = await tx.transaction.update({ where: { id: t.id }, data: { statut: "EXPIREE", motifRejet: motif } });
  const abonnement = await tx.abonnement.update({ where: { id: t.abonnementId }, data: { statut: "ANNULE" } });
  await historiser(tx, { abonnement, action: "EXPIRATION", par, note: `${t.numero} expiré : ${motif}` });
  return { transaction, abonnement, deja: false };
}

export async function rejeterTransaction(tx, { transactionId, par, motif }, now = new Date()) {
  const t = await chargerEtVerrouiller(tx, transactionId);
  if (t.statut === "ECHOUEE") return { transaction: t, deja: true };
  if (t.statut !== "EN_ATTENTE") throw new HttpError(409, "Seul un paiement en attente peut être rejeté.");
  const transaction = await tx.transaction.update({
    where: { id: t.id },
    data: { statut: "ECHOUEE", motifRejet: motif, confirmePar: par, confirmeLe: now },
  });
  const abonnement = await tx.abonnement.update({ where: { id: t.abonnementId }, data: { statut: "ANNULE" } });
  await historiser(tx, { abonnement, action: "REJET_PAIEMENT", par, note: `${t.numero} rejeté : ${motif}` });
  return { transaction, abonnement, deja: false };
}

/**
 * Remboursement : la plateforme ENREGISTRE le remboursement (l'argent est rendu hors plateforme pour un paiement
 * manuel). Transaction REMBOURSEE, facture marquée annulée, abonnement ANNULE (l'accès cesse). Remboursement total
 * uniquement. Un abonnement planifié à la suite garde ses dates : l'éventuel trou n'est pas recalculé.
 */
export async function rembourserTransaction(tx, { transactionId, par, motif }, now = new Date()) {
  const t = await chargerEtVerrouiller(tx, transactionId);
  if (t.statut === "REMBOURSEE") return { transaction: t, deja: true };
  if (t.statut !== "REUSSIE") throw new HttpError(409, "Seul un paiement réussi peut être remboursé.");
  const transaction = await tx.transaction.update({
    where: { id: t.id },
    data: { statut: "REMBOURSEE", rembourseLe: now, rembourseePar: par, motifRemboursement: motif },
  });
  const facture = t.facture
    ? await tx.factureAbonnement.update({ where: { id: t.facture.id }, data: { annuleeLe: now, annuleeMotif: motif } })
    : null;
  const abonnement = await tx.abonnement.update({ where: { id: t.abonnementId }, data: { statut: "ANNULE" } });
  await historiser(tx, { abonnement, action: "REMBOURSEMENT", par, note: `${t.numero} remboursé : ${motif}` });
  return { transaction, abonnement, facture, deja: false };
}

/** Suspension d'un abonnement (décision du SUPERADMIN, motif obligatoire). */
export async function suspendreAbonnement(tx, { atelierId, abonnementId, par, note }) {
  await verrouillerCle(tx, cleVerrouAtelier(atelierId));
  const a = await tx.abonnement.findFirst({ where: { id: abonnementId, atelierId } });
  if (!a) throw new HttpError(404, "Abonnement introuvable.");
  if (a.statut === "SUSPENDU") return { abonnement: a, deja: true };
  if (a.statut !== "CONFIRME") throw new HttpError(409, "Seul un abonnement activé peut être suspendu.");
  const abonnement = await tx.abonnement.update({ where: { id: a.id }, data: { statut: "SUSPENDU" } });
  await historiser(tx, { abonnement, action: "SUSPENSION", par, note });
  return { abonnement, deja: false };
}

export async function reactiverAbonnement(tx, { atelierId, abonnementId, par, note }) {
  await verrouillerCle(tx, cleVerrouAtelier(atelierId));
  const a = await tx.abonnement.findFirst({ where: { id: abonnementId, atelierId } });
  if (!a) throw new HttpError(404, "Abonnement introuvable.");
  if (a.statut === "CONFIRME") return { abonnement: a, deja: true };
  if (a.statut !== "SUSPENDU") throw new HttpError(409, "Seul un abonnement suspendu peut être réactivé.");
  const abonnement = await tx.abonnement.update({ where: { id: a.id }, data: { statut: "CONFIRME" } });
  await historiser(tx, { abonnement, action: "REACTIVATION", par, note });
  return { abonnement, deja: false };
}
