// Courriels liés aux paiements d'abonnement : déclaration reçue (vers la plateforme), paiement confirmé, rejeté ou
// remboursé (vers l'atelier). Toujours envoyés APRÈS la validation de la décision en base et sans jamais la faire
// échouer : une panne du service de courriel est journalisée, la décision reste valable (et visible dans l'interface).
import { envoyerEmail } from "./resend.js";
import { log, messageErreur } from "./logger.js";
import { notificationAbonnementTemplate } from "./emailTemplates.js";
import { formatDateFr } from "./rappelsAbonnement.js";

async function envoyerAuxDestinataires(destinataires, { sujet, titre, paragraphes, lien, libelleLien }, contexte, envoyer = envoyerEmail) {
  let envoyes = 0;
  for (const d of destinataires) {
    try {
      await envoyer({
        to: d.email,
        subject: `Tailora — ${sujet}`,
        html: notificationAbonnementTemplate({ prenom: d.prenom, titre, paragraphes, lien, libelleLien }),
      });
      envoyes += 1;
    } catch (err) {
      log.warn("abonnement", { evenement: "courriel_non_envoye", ...contexte, message: messageErreur(err) });
    }
  }
  return envoyes;
}

/** Nouvelle déclaration : prévient les comptes SUPERADMIN qui ont une adresse. */
export async function notifierDeclaration({ prisma, transaction, atelierNom, origine, envoyer }) {
  const admins = await prisma.user.findMany({ where: { role: "SUPERADMIN", email: { not: null } }, select: { email: true, prenom: true } });
  if (admins.length === 0) return 0;
  return envoyerAuxDestinataires(
    admins,
    {
      sujet: `Paiement d'abonnement à vérifier (${transaction.numero})`,
      titre: "Un paiement est à vérifier",
      paragraphes: [
        `${atelierNom} a déclaré un paiement de ${transaction.montant} FCFA (${transaction.numero}).`,
        "Rapprochez la référence indiquée de votre relevé, puis confirmez ou rejetez le paiement.",
      ],
      lien: `${origine}/gestion-abonnements`,
      libelleLien: "Ouvrir la gestion des abonnements",
    },
    { transaction: transaction.numero },
    envoyer,
  );
}

/** Décision sur un paiement : prévient les comptes ADMIN de l'atelier. */
export async function notifierDecision({ prisma, evenement, transactionId, origine, envoyer }) {
  const t = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      numero: true,
      atelierId: true,
      montant: true,
      motifRejet: true,
      motifRemboursement: true,
      abonnement: { select: { planNom: true, dateExpiration: true } },
      facture: { select: { numero: true } },
    },
  });
  if (!t) return 0;
  const destinataires = await prisma.user.findMany({
    where: { atelierId: t.atelierId, role: "ADMIN", email: { not: null } },
    select: { email: true, prenom: true },
  });
  if (destinataires.length === 0) return 0;

  const lien = `${origine}/abonnement`;
  const contenus = {
    ABONNEMENT_PAIEMENT_CONFIRME: {
      sujet: "Paiement confirmé",
      titre: "Votre paiement est confirmé",
      paragraphes: [
        `Nous avons bien reçu votre paiement de ${t.montant} FCFA (${t.numero}) pour la formule ${t.abonnement?.planNom ?? ""}.`.replace("  ", " "),
        t.abonnement?.dateExpiration ? `Votre abonnement est actif jusqu'au ${formatDateFr(t.abonnement.dateExpiration)}.` : "Votre abonnement est actif.",
        t.facture ? `Votre justificatif de paiement n° ${t.facture.numero} est disponible dans votre espace Abonnement.` : "",
      ].filter(Boolean),
      libelleLien: "Ouvrir mon abonnement",
    },
    ABONNEMENT_PAIEMENT_REJETE: {
      sujet: "Paiement non retrouvé",
      titre: "Votre paiement n'a pas pu être validé",
      paragraphes: [
        `Nous n'avons pas pu valider le paiement ${t.numero} de ${t.montant} FCFA.`,
        t.motifRejet ? `Motif : ${t.motifRejet}` : "",
        "Aucun abonnement n'a été activé. Vous pouvez déclarer de nouveau votre paiement en vérifiant la référence, ou contacter la plateforme.",
      ].filter(Boolean),
      libelleLien: "Déclarer un paiement",
    },
    ABONNEMENT_PAIEMENT_REMBOURSE: {
      sujet: "Paiement remboursé",
      titre: "Votre paiement a été remboursé",
      paragraphes: [
        `Le paiement ${t.numero} de ${t.montant} FCFA a été remboursé et l'abonnement correspondant est annulé.`,
        t.motifRemboursement ? `Motif : ${t.motifRemboursement}` : "",
        "Le justificatif de paiement correspondant est marqué annulé.",
      ].filter(Boolean),
      libelleLien: "Ouvrir mon abonnement",
    },
  }[evenement];
  if (!contenus) return 0;
  return envoyerAuxDestinataires(destinataires, { ...contenus, lien }, { transaction: t.numero, evenement }, envoyer);
}
