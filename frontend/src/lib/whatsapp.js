// Intégration WhatsApp via lien wa.me (texte pré-rempli uniquement — voir
// audit Phase 3 : aucune API WhatsApp Business n'est configurée, et wa.me ne
// permet de toute façon pas de joindre un fichier automatiquement). Aucun
// appel backend : tout se construit ici à partir de données déjà chargées
// côté frontend.
//
// Partage du FICHIER PDF (pas juste un texte) : uniquement possible via la
// Web Share API niveau 2 (`navigator.share({ files })`), qui ouvre la
// feuille de partage NATIVE de l'appareil — l'utilisateur y choisit
// WhatsApp lui-même, ce n'est jamais un envoi direct "à sens unique" vers
// WhatsApp uniquement (aucune API ne permet ça depuis un navigateur). Pris
// en charge sur mobile (Android/Chrome, iOS/Safari récents) ; absent sur la
// plupart des navigateurs desktop — `peutPartagerFichier()` doit TOUJOURS
// être vérifié avant d'afficher cette option, jamais supposé disponible.

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

// Vérifie le support réel de l'appareil/navigateur COURANT avant de
// proposer le partage de fichier — jamais supposé, jamais "on essaie et on
// espère" (voir consigne générale du projet : aucune fonctionnalité
// présentée comme fonctionnelle sans l'être réellement).
export function peutPartagerFichier() {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  try {
    // Fichier factice minimal, juste pour interroger canShare() sur le type
    // "fichier PDF" — jamais réellement partagé.
    const sonde = new File([""], "sonde.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [sonde] });
  } catch {
    return false;
  }
}

/**
 * Récupère le PDF déjà généré par le backend (même origine, cookie de
 * session envoyé automatiquement) et ouvre la feuille de partage native
 * avec ce fichier — l'utilisateur choisit WhatsApp (ou toute autre app)
 * dans cette feuille, ce n'est pas nous qui l'envoyons directement.
 * Rejette explicitement si `peutPartagerFichier()` est faux : ne JAMAIS
 * tenter un `navigator.share` non supporté en espérant que ça marche quand
 * même.
 */
export async function partagerPdfNatif({ pdfUrl, nomFichier, texte }) {
  if (!peutPartagerFichier()) {
    throw new Error("Le partage de fichier n'est pas pris en charge sur cet appareil/navigateur.");
  }
  const res = await fetch(pdfUrl, { credentials: "include" });
  if (!res.ok) {
    throw new Error("Impossible de récupérer le PDF à partager.");
  }
  const blob = await res.blob();
  const fichier = new File([blob], nomFichier, { type: "application/pdf" });
  if (!navigator.canShare({ files: [fichier] })) {
    throw new Error("Ce fichier ne peut pas être partagé sur cet appareil.");
  }
  await navigator.share({ files: [fichier], text: texte });
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
    `Concernant votre commande ${commande.numero} (${modele}) chez ${atelier?.nom || "l'atelier"} :`,
    `Statut actuel : ${statutLabel}.`,
  ];
  if (livraisonPertinente(commande.statut)) {
    lignes.push(`Livraison prévue le ${formatDateFr(commande.dateLivraisonPrevue)}.`);
  }
  lignes.push("Merci !");
  return lignes.join("\n");
}

export function buildPretMessage({ cliente, atelier }) {
  return `Bonjour ${cliente.prenom}, votre commande chez ${atelier?.nom || "l'atelier"} est prête ! Vous pouvez venir la récupérer. Merci 🙏`;
}

export function buildRecuMessage({ commande, cliente, atelier, totalPaye, solde }) {
  const devise = atelier?.devise || "FCFA";
  return [
    `Reçu — commande ${commande.numero}`,
    `Client : ${cliente.prenom} ${cliente.nom}`,
    `Total : ${formatMontant(commande.prixTotal, devise)}`,
    `Payé : ${formatMontant(totalPaye, devise)}`,
    `Solde restant : ${formatMontant(solde, devise)}`,
    `— ${atelier?.nom || "L'atelier"}`,
  ].join("\n");
}

// Rappel générique fiche cliente (voir ClienteDetailPage.jsx) : priorité à la
// commande prête à récupérer si elle existe, sinon rappel du solde global.
export function buildRappelMessage({ cliente, atelier, commandePrete, totalRestant, devise }) {
  if (commandePrete) {
    return `Bonjour ${cliente.prenom}, pour rappel votre commande ${commandePrete.numero} chez ${atelier?.nom || "l'atelier"} est prête ! Vous pouvez venir la récupérer. Merci 🙏`;
  }
  return `Bonjour ${cliente.prenom}, pour rappel il reste un solde de ${formatMontant(totalRestant, devise || "FCFA")} sur votre/vos commande(s) chez ${atelier?.nom || "l'atelier"}. Merci de votre compréhension.`;
}
