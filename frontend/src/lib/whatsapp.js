// Intégration WhatsApp via lien wa.me (texte pré-rempli uniquement — voir
// audit Phase 3 : aucune API WhatsApp Business n'est configurée, et wa.me ne
// permet de toute façon pas de joindre un fichier automatiquement). Aucun
// appel backend : tout se construit ici à partir de données déjà chargées
// côté frontend.

import { categorieLabel } from "../features/modeles/constants.js";

// Règle validée avec l'atelier (Phase 3) : les numéros sont enregistrés
// localement, sans indicatif, au format Niger à 8 chiffres (ex: "89758811").
// Un numéro déjà saisi avec un "+" ou un indicatif plus long est laissé tel
// quel. Voir backend/src/lib/phone.js pour la normalisation amont (espaces/
// tirets déjà retirés au moment de l'enregistrement).
const INDICATIF_NIGER = "227";

export function toWhatsAppNumber(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  // Un "+" initial signifie que l'indicatif a déjà été saisi explicitement.
  if (String(phone).trim().startsWith("+")) return digits;
  if (digits.length === 8) return INDICATIF_NIGER + digits;
  return digits;
}

export function waMeLink(phone, message) {
  const numero = toWhatsAppNumber(phone);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(message)}`;
}

function formatMontant(montant, devise) {
  return `${montant} ${devise || "FCFA"}`;
}

function formatDateFr(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

// Date de livraison non pertinente une fois la commande soldée (livrée) ou
// abandonnée (annulée) — évite un message du type "livraison prévue le..."
// sur une commande qui ne sera plus jamais livrée à cette date.
function livraisonPertinente(statut) {
  return statut !== "LIVREE" && statut !== "ANNULEE";
}

export function buildStatutMessage({ commande, cliente, atelier, statutLabel }) {
  const modele = commande.modele?.nom || categorieLabel(commande.typeVetement);
  const lignes = [
    `Bonjour ${cliente.prenom},`,
    `Concernant votre commande ${commande.numero} (${modele}) chez ${atelier?.nom || "AM Couture"} :`,
    `Statut actuel : ${statutLabel}.`,
  ];
  if (livraisonPertinente(commande.statut)) {
    lignes.push(`Livraison prévue le ${formatDateFr(commande.dateLivraisonPrevue)}.`);
  }
  lignes.push("Merci !");
  return lignes.join("\n");
}

export function buildPretMessage({ cliente, atelier }) {
  return `Bonjour ${cliente.prenom}, votre commande chez ${atelier?.nom || "AM Couture"} est prête ! Vous pouvez venir la récupérer. Merci 🙏`;
}

export function buildRecuMessage({ commande, cliente, atelier, totalPaye, solde }) {
  const devise = atelier?.devise || "FCFA";
  return [
    `Reçu — commande ${commande.numero}`,
    `Client : ${cliente.prenom} ${cliente.nom}`,
    `Total : ${formatMontant(commande.prixTotal, devise)}`,
    `Payé : ${formatMontant(totalPaye, devise)}`,
    `Solde restant : ${formatMontant(solde, devise)}`,
    `— ${atelier?.nom || "AM Couture"}`,
  ].join("\n");
}

// Rappel générique fiche cliente (voir ClienteDetailPage.jsx) : priorité à la
// commande prête à récupérer si elle existe, sinon rappel du solde global.
export function buildRappelMessage({ cliente, atelier, commandePrete, totalRestant, devise }) {
  if (commandePrete) {
    return `Bonjour ${cliente.prenom}, pour rappel votre commande ${commandePrete.numero} chez ${atelier?.nom || "AM Couture"} est prête ! Vous pouvez venir la récupérer. Merci 🙏`;
  }
  return `Bonjour ${cliente.prenom}, pour rappel il reste un solde de ${formatMontant(totalRestant, devise || "FCFA")} sur votre/vos commande(s) chez ${atelier?.nom || "AM Couture"}. Merci de votre compréhension.`;
}
