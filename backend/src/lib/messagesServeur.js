// Textes produits par le SERVEUR (fil d'activité des clientes, courriels, PDF) dans la langue de la personne (7.7).
//
// Langues : « fr » et « en ». Toute autre valeur (ex. une langue retirée ou inconnue) retombe sur
// « fr » : jamais de clé brute affichée. Une clé absente d'une langue retombe aussi sur « fr », puis sur la clé elle-même.
//
// Le fil d'activité enregistre un CODE et des PARAMÈTRES (pas seulement un texte) : le message est composé à la lecture,
// dans la langue de la cliente. Le texte français est aussi conservé à l'écriture (lignes antérieures, export, secours).
export const LANGUES_SERVEUR = ["fr", "en"];
export const LANGUE_PAR_DEFAUT = "fr";

export function normaliserLangue(langue) {
  return LANGUES_SERVEUR.includes(langue) ? langue : LANGUE_PAR_DEFAUT;
}

const STATUTS = {
  fr: { NOUVELLE: "Nouvelle", EN_CONFECTION: "En confection", ESSAYAGE: "Essayage", RETOUCHES: "Retouches", TERMINEE: "Terminée", LIVREE: "Livrée", ANNULEE: "Annulée" },
  en: { NOUVELLE: "New", EN_CONFECTION: "In production", ESSAYAGE: "Fitting", RETOUCHES: "Alterations", TERMINEE: "Completed", LIVREE: "Delivered", ANNULEE: "Cancelled" },
};

const MESSAGES = {
  fr: {
    "notif.COMMANDE_CREEE": "Votre commande {{numero}} a été enregistrée.",
    "notif.PAIEMENT_ENREGISTRE": "Paiement de {{montant}} enregistré sur votre commande {{numero}}.",
    "notif.COMMANDE_STATUT_CHANGE": "Votre commande {{numero}} est maintenant : {{statut}}.",
    "notif.COMMANDE_ANNULEE": "Votre commande {{numero}} a été annulée.",
    "notif.LIVRAISON_ENREGISTREE": "Votre commande {{numero}} a été livrée.",
    "notif.RECU_EMIS": "Un reçu est disponible pour votre commande {{numero}}.",
    "notif.DEMANDE_ACCEPTEE": "Votre demande a été acceptée et liée à la commande {{numero}}.",
    "notif.DEMANDE_REFUSEE": "Votre demande a été refusée.",
    "notif.DEMANDE_REFUSEE_MOTIF": "Votre demande a été refusée : {{motif}}",
    "email.verification.sujet": "Confirmez votre email — Gestion d'Atelier",
    "email.verification.titre": "Bienvenue{{prenom}} !",
    "email.verification.corps": "Merci d'avoir créé votre atelier sur Gestion d'Atelier. Confirmez votre adresse email en cliquant sur le lien ci-dessous :",
    "email.verification.bouton": "Confirmer mon email",
    "email.verification.pied": "Ce lien expire dans 24 heures. Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email.",
    "email.invitation.sujet": "Créez votre compte client — Gestion d'Atelier",
    "email.invitation.titre": "Bonjour{{prenom}} !",
    "email.invitation.corps": "Votre atelier vous invite à créer votre espace client, où vous pourrez suivre vos commandes, vos mesures et vos paiements.",
    "email.invitation.bouton": "Créer mon compte",
    "email.invitation.pied": "Ce lien expire dans 7 jours. Votre identifiant de connexion sera votre numéro de téléphone ({{identifiant}}). Si vous ne vous attendiez pas à cette invitation, ignorez cet email.",
    "email.reinitialisation.sujet": "Réinitialisation de votre mot de passe — Gestion d'Atelier",
    "email.reinitialisation.titre": "Réinitialisation de mot de passe",
    "email.reinitialisation.corps": "Vous avez demandé à réinitialiser votre mot de passe sur Gestion d'Atelier. Cliquez sur le lien ci-dessous pour en choisir un nouveau :",
    "email.reinitialisation.bouton": "Réinitialiser mon mot de passe",
    "email.reinitialisation.pied": "Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe reste inchangé.",
    "pdf.recu": "REÇU N° {{numero}}",
    "pdf.commande": "COMMANDE N° {{numero}}",
    "pdf.client": "Client",
    "pdf.details": "Détails",
    "pdf.commandeNo": "Commande N° {{numero}}",
    "pdf.datePaiement": "Date paiement : {{valeur}}",
    "pdf.mode": "Mode : {{valeur}}",
    "pdf.reference": "Référence : {{valeur}}",
    "pdf.montantPaye": "Montant payé",
    "pdf.totalEncaisse": "Total encaissé à ce jour",
    "pdf.mentionRecu": "Document généré automatiquement — conserver comme preuve de paiement.",
    "pdf.modele": "Modèle : {{valeur}}",
    "pdf.statut": "Statut : {{valeur}}",
    "pdf.livraisonPrevue": "Livraison prévue : {{valeur}}",
    "pdf.montantTotal": "Montant total",
    "pdf.soldeRestant": "Solde restant",
    "pdf.mentionFicheMontants": "Document généré automatiquement — montants à jour au moment de l'émission.",
    "pdf.mentionFiche": "Document généré automatiquement.",
    "pdf.emisM": "Émis",
    "pdf.emisF": "Émise",
    "pdf.emissionLieu": "{{verbe}} à {{lieu}} le {{dateHeure}}",
    "pdf.emissionSans": "{{verbe}} le {{dateHeure}}",
    "pdf.dateHeure": "{{jour}} à {{heure}}",
    "pdf.vetement.ROBE": "Robe",
    "pdf.vetement.BOUBOU": "Boubou",
    "pdf.vetement.ENSEMBLE": "Ensemble",
    "pdf.vetement.PANTALON": "Pantalon",
    "pdf.vetement.CHEMISE": "Chemise",
    "pdf.vetement.JUPE": "Jupe",
    "pdf.vetement.KAFTAN": "Kaftan",
    "pdf.vetement.COSTUME": "Costume",
    "pdf.vetement.TENUE_TRADITIONNELLE": "Tenue traditionnelle",
    "pdf.vetement.AUTRE": "Autre",
  },
  en: {
    "notif.COMMANDE_CREEE": "Your order {{numero}} has been recorded.",
    "notif.PAIEMENT_ENREGISTRE": "Payment of {{montant}} recorded on your order {{numero}}.",
    "notif.COMMANDE_STATUT_CHANGE": "Your order {{numero}} is now: {{statut}}.",
    "notif.COMMANDE_ANNULEE": "Your order {{numero}} has been cancelled.",
    "notif.LIVRAISON_ENREGISTREE": "Your order {{numero}} has been delivered.",
    "notif.RECU_EMIS": "A receipt is available for your order {{numero}}.",
    "notif.DEMANDE_ACCEPTEE": "Your request has been accepted and linked to order {{numero}}.",
    "notif.DEMANDE_REFUSEE": "Your request has been declined.",
    "notif.DEMANDE_REFUSEE_MOTIF": "Your request has been declined: {{motif}}",
    "email.verification.sujet": "Confirm your email — Gestion d'Atelier",
    "email.verification.titre": "Welcome{{prenom}}!",
    "email.verification.corps": "Thank you for creating your workshop on Gestion d'Atelier. Confirm your email address by clicking the link below:",
    "email.verification.bouton": "Confirm my email",
    "email.verification.pied": "This link expires in 24 hours. If you did not sign up, please ignore this email.",
    "email.invitation.sujet": "Create your client account — Gestion d'Atelier",
    "email.invitation.titre": "Hello{{prenom}}!",
    "email.invitation.corps": "Your workshop invites you to create your client area, where you can follow your orders, measurements and payments.",
    "email.invitation.bouton": "Create my account",
    "email.invitation.pied": "This link expires in 7 days. Your login will be your phone number ({{identifiant}}). If you were not expecting this invitation, please ignore this email.",
    "email.reinitialisation.sujet": "Reset your password — Gestion d'Atelier",
    "email.reinitialisation.titre": "Password reset",
    "email.reinitialisation.corps": "You asked to reset your password on Gestion d'Atelier. Click the link below to choose a new one:",
    "email.reinitialisation.bouton": "Reset my password",
    "email.reinitialisation.pied": "This link expires in 1 hour. If you did not make this request, ignore this email — your password stays unchanged.",
    "pdf.recu": "RECEIPT NO. {{numero}}",
    "pdf.commande": "ORDER NO. {{numero}}",
    "pdf.client": "Client",
    "pdf.details": "Details",
    "pdf.commandeNo": "Order No. {{numero}}",
    "pdf.datePaiement": "Payment date: {{valeur}}",
    "pdf.mode": "Method: {{valeur}}",
    "pdf.reference": "Reference: {{valeur}}",
    "pdf.montantPaye": "Amount paid",
    "pdf.totalEncaisse": "Total received to date",
    "pdf.mentionRecu": "Automatically generated document — keep as proof of payment.",
    "pdf.modele": "Model: {{valeur}}",
    "pdf.statut": "Status: {{valeur}}",
    "pdf.livraisonPrevue": "Expected delivery: {{valeur}}",
    "pdf.montantTotal": "Total amount",
    "pdf.soldeRestant": "Balance due",
    "pdf.mentionFicheMontants": "Automatically generated document — amounts up to date at the time of issue.",
    "pdf.mentionFiche": "Automatically generated document.",
    "pdf.emisM": "Issued",
    "pdf.emisF": "Issued",
    "pdf.emissionLieu": "{{verbe}} at {{lieu}} on {{dateHeure}}",
    "pdf.emissionSans": "{{verbe}} on {{dateHeure}}",
    "pdf.dateHeure": "{{jour}} at {{heure}}",
    "pdf.vetement.ROBE": "Dress",
    "pdf.vetement.BOUBOU": "Boubou",
    "pdf.vetement.ENSEMBLE": "Set",
    "pdf.vetement.PANTALON": "Trousers",
    "pdf.vetement.CHEMISE": "Shirt",
    "pdf.vetement.JUPE": "Skirt",
    "pdf.vetement.KAFTAN": "Kaftan",
    "pdf.vetement.COSTUME": "Suit",
    "pdf.vetement.TENUE_TRADITIONNELLE": "Traditional outfit",
    "pdf.vetement.AUTRE": "Other",
  },
};

/** Libellé d'un statut de commande dans la langue donnée (le code lui-même si inconnu). */
export function libelleStatut(statut, langue = LANGUE_PAR_DEFAUT) {
  const l = normaliserLangue(langue);
  return STATUTS[l][statut] ?? STATUTS[LANGUE_PAR_DEFAUT][statut] ?? String(statut);
}

/** Texte traduit ; `{{nom}}` remplacé par `params.nom`. Repli : français, puis la clé. */
export function traduire(langue, cle, params = {}) {
  const l = normaliserLangue(langue);
  const modele = MESSAGES[l][cle] ?? MESSAGES[LANGUE_PAR_DEFAUT][cle] ?? cle;
  return modele.replace(/\{\{(\w+)\}\}/g, (_, nom) => (params[nom] === undefined || params[nom] === null ? "" : String(params[nom])));
}

/** Code du message du fil d'activité (`DEMANDE_REFUSEE` devient `…_MOTIF` quand un motif est donné). */
export function codeNotification(type, params = {}) {
  return type === "DEMANDE_REFUSEE" && params.motif ? "DEMANDE_REFUSEE_MOTIF" : type;
}

/** Message du fil d'activité composé dans la langue demandée, à partir du code et des paramètres. */
export function messageNotification(code, params = {}, langue = LANGUE_PAR_DEFAUT) {
  const p = params.statut ? { ...params, statut: libelleStatut(params.statut, langue) } : params;
  return traduire(langue, `notif.${code}`, p);
}

/** Pour l'affichage : compose dans la langue si la ligne porte un code connu, sinon renvoie le texte enregistré (lignes antérieures). */
export function rendreNotification(n, langue) {
  if (n.code && MESSAGES[LANGUE_PAR_DEFAUT][`notif.${n.code}`]) return messageNotification(n.code, n.params ?? {}, langue);
  return n.message;
}

/** Type de vêtement dans la langue donnée (le code lui-même si inconnu). */
export function libelleVetement(type, langue = LANGUE_PAR_DEFAUT) {
  const cle = `pdf.vetement.${type}`;
  const t = traduire(langue, cle);
  return t === cle ? String(type) : t;
}

/** Paramètres régionaux des dates dans les documents. */
export const LOCALE_DATES = { fr: "fr-FR", en: "en-GB" };

/** Langue d'un document demandé : paramètre `?langue=fr|en` s'il est valide, sinon la préférence du compte connecté. */
export function langueDemandee(req) {
  const voulue = typeof req.query?.langue === "string" ? req.query.langue : null;
  return voulue && LANGUES_SERVEUR.includes(voulue) ? voulue : normaliserLangue(req.user?.langue);
}
