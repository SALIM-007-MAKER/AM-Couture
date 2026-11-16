// Paiement d'abonnement par Wave (INACTIF par défaut, voir paiementWaveActif dans lib/wave.js).
//
// Règles de sécurité, dans l'ordre d'importance :
//  1. Un paiement n'est JAMAIS confirmé sur la foi d'un navigateur ni du seul contenu d'un webhook. Le webhook (signé)
//     ne sert que de déclencheur : l'état réel est relu directement chez Wave, avec notre clé, puis comparé à la
//     transaction (session, référence, montant, devise). Le moindre écart n'active rien.
//  2. Rien n'est supposé en cas de doute : si Wave ne répond pas, la transaction reste EN_ATTENTE et l'échange est
//     rejoué (Wave réessaie pendant 3 jours, et un rattrapage périodique relit les sessions en suspens).
//  3. Chaque événement n'a d'effet qu'une fois (table EvenementPaiement, écrite dans la même transaction que l'effet),
//     et l'effet lui-même est idempotent (verrou par atelier puis par transaction, état relu sous verrou).
import { HttpError } from "../middlewares/error.middleware.js";
import { log, messageErreur } from "./logger.js";
import { journaliserSecurite } from "./securityLog.js";
import { creerSessionCheckout, recupererSession, evaluerSession, ErreurWave } from "./wave.js";
import { souscrire, confirmerTransaction, expirerTransaction, chargerEtVerrouiller } from "./souscription.js";

/** Délai au-delà duquel une transaction Wave sans session (création interrompue) est abandonnée. */
const DELAI_SESSION_ABSENTE_MS = 5 * 60 * 1000;
/** Une transaction plus jeune que ceci est laissée au webhook avant d'être relue par le rattrapage. */
const DELAI_RATTRAPAGE_MS = 3 * 60 * 1000;

/**
 * Applique l'issue d'une session à la transaction, sous verrou. `evenementId` (webhook) est mémorisé dans la même
 * transaction : une seconde livraison du même événement ne fait rien.
 */
export async function appliquerIssue(prisma, { transactionId, issue, raison, session, evenement, motif }) {
  const resultat = await prisma.$transaction(
    async (tx) => {
      const t = await chargerEtVerrouiller(tx, transactionId);

      if (evenement?.id) {
        const cree = await tx.evenementPaiement.createMany({
          data: [{ fournisseur: "WAVE", evenementId: evenement.id, type: evenement.type }],
          skipDuplicates: true,
        });
        if (cree.count === 0) return { statut: t.statut, deja: true };
      }

      if (t.statut !== "EN_ATTENTE") return { statut: t.statut, deja: true };

      if (issue === "REUSSI") {
        const atelier = await tx.atelier.findUnique({ where: { id: t.atelierId }, select: { nom: true } });
        await confirmerTransaction(tx, {
          transactionId,
          par: `wave:${session.id}`,
          atelierNom: atelier?.nom ?? "—",
          automatique: true,
          note: `Paiement Wave ${t.numero} vérifié auprès de Wave (session ${session.id})`,
        });
        await tx.transaction.update({
          where: { id: transactionId },
          data: { donneesBrutesWebhook: { evenement: evenement ?? null, session } },
        });
        return { statut: "REUSSIE", deja: false, atelierId: t.atelierId, numero: t.numero };
      }
      if (issue === "EXPIRE") {
        await expirerTransaction(tx, { transactionId, motif: motif ?? "Session Wave expirée sans paiement" });
        return { statut: "EXPIREE", deja: false };
      }
      if (issue === "INCOHERENT") {
        // Rien n'est activé ni clos : l'argent a peut-être été pris, un humain doit trancher (remboursement via Wave).
        await tx.transaction.update({
          where: { id: transactionId },
          data: { donneesBrutesWebhook: { evenement: evenement ?? null, session, incoherence: raison } },
        });
        return { statut: "EN_ATTENTE", deja: false, incoherent: true, atelierId: t.atelierId, numero: t.numero, raison };
      }
      return { statut: "EN_ATTENTE", deja: false };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );

  if (resultat.incoherent) {
    log.error("erreur", { categorie: "paiement_wave", operation: "incoherence", transaction: resultat.numero, raison: resultat.raison });
    await journaliserSecurite("ABONNEMENT_WAVE_INCOHERENT", { atelierId: resultat.atelierId, details: { prefixe: resultat.numero } });
  } else if (!resultat.deja && resultat.statut === "REUSSIE") {
    await journaliserSecurite("ABONNEMENT_PAIEMENT_CONFIRME", { atelierId: resultat.atelierId, details: { prefixe: resultat.numero } });
    log.info("abonnement", { evenement: "paiement_wave_confirme", transaction: resultat.numero });
  }
  return resultat;
}

/** Relit la session d'une transaction Wave en attente et applique ce que Wave en dit. */
export async function reconcilierTransactionWave(prisma, transaction, now = new Date()) {
  if (transaction.statut !== "EN_ATTENTE" || transaction.moyenPaiement !== "WAVE") return { statut: transaction.statut, deja: true };

  if (!transaction.referenceExterne) {
    if (now.getTime() - new Date(transaction.createdAt).getTime() < DELAI_SESSION_ABSENTE_MS) return { statut: "EN_ATTENTE", deja: false };
    return appliquerIssue(prisma, { transactionId: transaction.id, issue: "EXPIRE", motif: "Session Wave jamais créée" });
  }
  const session = await recupererSession(transaction.referenceExterne);
  const { issue, raison } = evaluerSession(session, transaction);
  return appliquerIssue(prisma, { transactionId: transaction.id, issue, raison, session });
}

/**
 * Traite un webhook Wave déjà authentifié (signature vérifiée par l'appelant). Lance ErreurWave si la relecture
 * échoue : l'appelant répond alors 503 et Wave réessaie.
 */
export async function traiterEvenementWave(prisma, event) {
  const type = event?.type;
  if (type === "checkout.session.payment_failed") {
    // Une tentative a échoué mais la session reste ouverte jusqu'à son expiration : on trace, on ne conclut rien.
    log.info("abonnement", { evenement: "paiement_wave_echec_tentative", evenementId: event.id });
    return { ignore: true };
  }
  if (type !== "checkout.session.completed") return { ignore: true };

  const referenceInterne = event.data?.client_reference;
  const sessionId = event.data?.id;
  if (!referenceInterne || !sessionId) return { ignore: true };

  const transaction = await prisma.transaction.findUnique({ where: { referenceInterne } });
  if (!transaction || transaction.moyenPaiement !== "WAVE") return { ignore: true };

  // Relecture AUTHENTIFIÉE chez Wave : le contenu du webhook, même signé, ne fait jamais foi.
  const session = await recupererSession(sessionId);
  const { issue, raison } = evaluerSession(session, transaction);
  return appliquerIssue(prisma, {
    transactionId: transaction.id,
    issue,
    raison,
    session,
    evenement: { id: event.id, type },
  });
}

/** Rattrapage périodique : relit les sessions Wave restées en attente (aucun webhook reçu, session expirée sans événement). */
export async function rattraperTransactionsWave(prisma, now = new Date()) {
  const enAttente = await prisma.transaction.findMany({
    where: { moyenPaiement: "WAVE", statut: "EN_ATTENTE", createdAt: { lt: new Date(now.getTime() - DELAI_RATTRAPAGE_MS) } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const bilan = { examinees: enAttente.length, confirmees: 0, expirees: 0, incoherentes: 0, erreurs: 0 };
  for (const t of enAttente) {
    try {
      const r = await reconcilierTransactionWave(prisma, t, now);
      if (r.statut === "REUSSIE") bilan.confirmees += 1;
      else if (r.statut === "EXPIREE") bilan.expirees += 1;
      else if (r.incoherent) bilan.incoherentes += 1;
    } catch (err) {
      bilan.erreurs += 1;
      log.warn("abonnement", { evenement: "rattrapage_wave_echec", transaction: t.numero, message: messageErreur(err) });
    }
  }
  return bilan;
}

/**
 * Démarre un paiement Wave : crée la souscription (abonnement et transaction EN_ATTENTE), puis la session chez Wave.
 * Si Wave ne répond pas ou refuse, la transaction est clôturée et rien n'est activé.
 */
export async function demarrerPaiementWave(prisma, { atelier, plan, dureeMois, par, origine }) {
  // Une session Wave périmée mais non encore clôturée bloquerait la nouvelle déclaration : on relit d'abord.
  const enAttente = await prisma.transaction.findMany({ where: { atelierId: atelier.id, statut: "EN_ATTENTE", moyenPaiement: "WAVE" } });
  for (const t of enAttente) {
    await reconcilierTransactionWave(prisma, t).catch((err) =>
      log.warn("abonnement", { evenement: "reconciliation_wave_echec", transaction: t.numero, message: messageErreur(err) }),
    );
  }

  const { transaction } = await prisma.$transaction(
    (tx) => souscrire(tx, { atelier, plan, dureeMois, moyenPaiement: "WAVE", par }),
    { maxWait: 10_000, timeout: 15_000 },
  );

  let session;
  try {
    session = await creerSessionCheckout({
      montant: transaction.montant,
      referenceInterne: transaction.referenceInterne,
      successUrl: `${origine}/abonnement?paiement=retour&transaction=${encodeURIComponent(transaction.numero)}`,
      errorUrl: `${origine}/abonnement?paiement=echec&transaction=${encodeURIComponent(transaction.numero)}`,
    });
  } catch (err) {
    await appliquerIssue(prisma, { transactionId: transaction.id, issue: "EXPIRE", motif: "Session Wave non créée" }).catch(() => {});
    log.error("erreur", { categorie: "paiement_wave", operation: "creation_session", transaction: transaction.numero, message: messageErreur(err) });
    const indisponible = err instanceof ErreurWave && (err.reseau || err.waveStatus >= 500);
    throw new HttpError(indisponible ? 503 : 502, "Wave n'a pas pu ouvrir le paiement. Réessayez dans quelques instants, ou déclarez un paiement manuel.");
  }
  if (!session?.id || !session?.wave_launch_url) {
    await appliquerIssue(prisma, { transactionId: transaction.id, issue: "EXPIRE", motif: "Session Wave non créée" }).catch(() => {});
    throw new HttpError(502, "Wave a renvoyé une réponse inattendue. Aucun paiement n'a été ouvert.");
  }
  await prisma.transaction.update({ where: { id: transaction.id }, data: { referenceExterne: session.id } });
  return { transaction, checkoutUrl: session.wave_launch_url };
}
