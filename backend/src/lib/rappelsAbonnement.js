// Rappels d'abonnement envoyés par courriel : fin d'essai et échéance d'abonnement. Déclenchés par la tâche
// quotidienne (routes/cron.routes.js).
//
// Garanties :
//  - un rappel n'est envoyé qu'UNE fois par échéance : la ligne RappelAbonnement (unique par atelier, type et
//    échéance) est réservée AVANT l'envoi ; une tâche rejouée ou lancée en double ne renvoie rien ;
//  - si aucun destinataire n'a pu être joint, la réservation est retirée : la tâche du lendemain réessaie ;
//  - aucun rappel pour un atelier qui a déjà déclaré un paiement en attente de vérification, pour un atelier
//    suspendu, pour un abonnement suspendu, ni pour un atelier antérieur à l'essai gratuit ;
//  - les rappels « terminé » ne concernent que les échéances récentes (grâce + 3 jours) : au premier déploiement,
//    aucun atelier abandonné depuis longtemps ne reçoit de courriel.
import { etatAbonnementAtelier, finDeChaine } from "./abonnement.js";
import { log, messageErreur } from "./logger.js";
import { notificationAbonnementTemplate } from "./emailTemplates.js";

const JOUR = 86_400_000;

const MESSAGES = {
  ESSAI_J3: { sujet: "Votre essai gratuit se termine dans 3 jours" },
  ESSAI_J1: { sujet: "Votre essai gratuit se termine demain" },
  ESSAI_FIN: { sujet: "Votre essai gratuit est terminé" },
  ABO_J7: { sujet: "Votre abonnement expire dans 7 jours" },
  ABO_J3: { sujet: "Votre abonnement expire dans 3 jours" },
  ABO_J1: { sujet: "Votre abonnement expire demain" },
  ABO_FIN: { sujet: "Votre abonnement est arrivé à échéance" },
};

export function formatDateFr(date) {
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
const cleDe = (date) => new Date(date).toISOString().slice(0, 10);
const joursAvant = (date, now) => Math.ceil((new Date(date).getTime() - now.getTime()) / JOUR);

/**
 * Détermine le rappel dû aujourd'hui pour un atelier, ou null. Fonction pure.
 * @returns {{ type: string, cle: string, echeance: Date, graceJusquAu: Date|null } | null}
 */
export function planifierRappel({ trialEndsAt, abonnements, paiementEnAttente, joursGrace }, now = new Date()) {
  if (!trialEndsAt || paiementEnAttente) return null;
  const etat = etatAbonnementAtelier({ trialEndsAt }, abonnements, now);

  if (etat.statut === "SUSPENDU") return null;

  if (etat.statut === "ACTIF") {
    const echeance = finDeChaine(abonnements, now);
    if (!echeance) return null;
    const jours = joursAvant(echeance, now);
    const type = jours <= 1 ? "ABO_J1" : jours <= 3 ? "ABO_J3" : jours <= 7 ? "ABO_J7" : null;
    return type ? { type, cle: cleDe(echeance), echeance, graceJusquAu: null } : null;
  }

  if (etat.statut === "ESSAI") {
    const jours = joursAvant(trialEndsAt, now);
    const type = jours <= 1 ? "ESSAI_J1" : jours <= 3 ? "ESSAI_J3" : null;
    return type ? { type, cle: cleDe(trialEndsAt), echeance: new Date(trialEndsAt), graceJusquAu: null } : null;
  }

  if (etat.statut === "EXPIRE" || etat.statut === "EN_ATTENTE") {
    const fins = [trialEndsAt, ...abonnements.filter((a) => a.statut === "CONFIRME").map((a) => a.dateExpiration)]
      .filter(Boolean)
      .map((d) => new Date(d))
      .filter((d) => d <= now);
    if (fins.length === 0) return null;
    const finDroits = new Date(Math.max(...fins.map((d) => d.getTime())));
    if (now.getTime() - finDroits.getTime() > (joursGrace + 3) * JOUR) return null;
    const avaitUnAbonnement = abonnements.some((a) => a.statut === "CONFIRME" && a.dateExpiration && new Date(a.dateExpiration) <= now);
    return {
      type: avaitUnAbonnement ? "ABO_FIN" : "ESSAI_FIN",
      cle: cleDe(finDroits),
      echeance: finDroits,
      graceJusquAu: new Date(finDroits.getTime() + joursGrace * JOUR),
    };
  }
  return null;
}

export function contenuRappel(rappel, { prenom, lien }) {
  const echeance = formatDateFr(rappel.echeance);
  const grace = rappel.graceJusquAu ? formatDateFr(rappel.graceJusquAu) : null;
  const fin = rappel.type.endsWith("_FIN");
  const essai = rappel.type.startsWith("ESSAI");
  const paragraphes = fin
    ? [
        essai ? `Votre essai gratuit s'est terminé le ${echeance}.` : `Votre abonnement est arrivé à échéance le ${echeance}.`,
        `Vous gardez l'accès complet jusqu'au ${grace}. Passé cette date, votre atelier passera en lecture seule : vous pourrez toujours consulter et exporter vos données, mais plus en saisir de nouvelles.`,
        "Aucune de vos données n'est supprimée. Pour reprendre la saisie, choisissez une formule et déclarez votre paiement.",
      ]
    : [
        essai ? `Votre essai gratuit se termine le ${echeance}.` : `Votre abonnement expire le ${echeance}.`,
        "Pour continuer sans interruption, choisissez une formule et déclarez votre paiement avant cette date.",
        "Si vous avez déjà renouvelé, ce message ne vous concerne plus : votre paiement est en cours de vérification.",
      ];
  return {
    sujet: `Tailora — ${MESSAGES[rappel.type].sujet}`,
    html: notificationAbonnementTemplate({
      prenom,
      titre: MESSAGES[rappel.type].sujet,
      paragraphes,
      lien,
      libelleLien: "Voir les formules",
    }),
  };
}

/**
 * Parcourt les ateliers actifs et envoie les rappels dus. `envoyer` = ({ to, subject, html }) => Promise (injecté
 * pour les tests ; en production : envoyerEmail de lib/resend.js).
 */
export async function envoyerRappelsAbonnement({ prisma, envoyer, origine, now = new Date() }) {
  const resultat = { ateliersExamines: 0, rappelsEnvoyes: 0, courrielsEnvoyes: 0, dejaEnvoyes: 0, erreurs: [] };
  const parametres = await prisma.parametresPlateforme.findUnique({ where: { id: "plateforme" }, select: { joursGrace: true } });
  const joursGrace = parametres?.joursGrace ?? 7;

  const [ateliers, enAttente] = await Promise.all([
    prisma.atelier.findMany({
      where: { actif: true, trialEndsAt: { not: null } },
      select: {
        id: true,
        trialEndsAt: true,
        users: { where: { role: "ADMIN", email: { not: null } }, select: { email: true, prenom: true } },
        abonnements: {
          where: { statut: { in: ["CONFIRME", "SUSPENDU"] } },
          select: { statut: true, dateDebut: true, dateExpiration: true },
        },
      },
    }),
    prisma.transaction.findMany({ where: { statut: "EN_ATTENTE" }, select: { atelierId: true } }),
  ]);
  const ateliersAvecPaiement = new Set(enAttente.map((t) => t.atelierId));

  for (const atelier of ateliers) {
    resultat.ateliersExamines += 1;
    if (atelier.users.length === 0) continue;
    const rappel = planifierRappel(
      {
        trialEndsAt: atelier.trialEndsAt,
        abonnements: atelier.abonnements,
        paiementEnAttente: ateliersAvecPaiement.has(atelier.id),
        joursGrace,
      },
      now,
    );
    if (!rappel) continue;

    // Réservation avant envoi : la contrainte d'unicité écarte les doublons, y compris entre deux exécutions simultanées.
    let reservation;
    try {
      reservation = await prisma.rappelAbonnement.create({
        data: { atelierId: atelier.id, type: rappel.type, cle: rappel.cle },
      });
    } catch (err) {
      if (err?.code === "P2002") {
        resultat.dejaEnvoyes += 1;
        continue;
      }
      throw err;
    }

    let reussis = 0;
    for (const user of atelier.users) {
      const { sujet, html } = contenuRappel(rappel, { prenom: user.prenom, lien: `${origine}/abonnement` });
      try {
        await envoyer({ to: user.email, subject: sujet, html });
        reussis += 1;
      } catch (err) {
        resultat.erreurs.push({ atelierId: atelier.id, type: rappel.type, message: messageErreur(err) });
      }
    }
    if (reussis === 0) {
      // Personne n'a pu être joint : on libère la réservation pour que la tâche de demain réessaie.
      await prisma.rappelAbonnement.delete({ where: { id: reservation.id } });
      log.warn("abonnement", { evenement: "rappel_non_envoye", atelierId: atelier.id, type: rappel.type });
    } else {
      resultat.rappelsEnvoyes += 1;
      resultat.courrielsEnvoyes += reussis;
      log.info("abonnement", { evenement: "rappel_envoye", atelierId: atelier.id, type: rappel.type, destinataires: reussis });
    }
  }
  return resultat;
}
