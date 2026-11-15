// Logique PURE de la souscription (sans React) : validation de la déclaration de paiement, corps de requête, bandeau
// d'accès. Les règles reprennent celles du serveur (backend/src/schemas/abonnementPaiement.schema.js) pour guider la
// saisie ; le serveur reste seul juge (il revalide tout et calcule le prix lui-même).

// Moyens qu'un atelier peut déclarer. Wave n'en fait pas partie : il passe par son propre parcours, confirmé par Wave.
export const MOYENS_PAIEMENT = ["MOBILE_MONEY", "NITA", "AMANA", "VIREMENT", "ESPECES", "AUTRE"];

export const referenceRequise = (moyen) => moyen !== "ESPECES";
export const operateurPertinent = (moyen) => moyen === "MOBILE_MONEY";

/** Erreurs de saisie par champ (clés de traduction), objet vide si tout est valide. */
export function validerDeclaration({ moyenPaiement, reference, dureeMois }) {
  const erreurs = {};
  if (!MOYENS_PAIEMENT.includes(moyenPaiement)) erreurs.moyenPaiement = "subPay.errMoyen";
  if (!Number.isInteger(dureeMois) || dureeMois < 1) erreurs.dureeMois = "subPay.errDuree";
  const ref = (reference ?? "").trim();
  if (referenceRequise(moyenPaiement) && ref.length < 3) erreurs.reference = "subPay.errReference";
  return erreurs;
}

/** Corps envoyé au serveur : champs vides retirés, aucun montant (le prix est calculé par le serveur). */
export function corpsDeclaration({ planId, dureeMois, moyenPaiement, operateur, reference, preuveNote }) {
  const corps = { planId, dureeMois, moyenPaiement };
  if (operateurPertinent(moyenPaiement) && operateur?.trim()) corps.operateur = operateur.trim();
  if (reference?.trim()) corps.reference = reference.trim();
  if (preuveNote?.trim()) corps.preuveNote = preuveNote.trim();
  return corps;
}

/**
 * Clé d'idempotence d'une tentative de déclaration (8 à 128 caractères). Une même tentative réémise après une coupure
 * réseau garde sa clé (le serveur ne crée alors qu'une transaction) ; toute modification de la saisie ou toute
 * nouvelle déclaration en demande une neuve, sans quoi le serveur rejouerait l'ancienne réponse.
 */
export function nouvelleCleIdempotence(generateur = () => globalThis.crypto.randomUUID()) {
  return `souscription-${generateur()}`;
}

// Tons des statuts de transaction (mêmes familles de couleurs que les autres badges de l'application).
export const STYLES_TRANSACTION = {
  EN_ATTENTE: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  REUSSIE: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  ECHOUEE: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  ANNULEE: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  EXPIREE: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  REMBOURSEE: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
};
export const styleTransaction = (statut) => STYLES_TRANSACTION[statut] ?? STYLES_TRANSACTION.ANNULEE;

/**
 * Bandeau d'accès à afficher dans tout l'espace de l'atelier, selon `acces` renvoyé par GET /api/abonnements/etat :
 *  - null            : rien à dire (accès complet, ou état inconnu) ;
 *  - "GRACE"         : tout fonctionne encore, mais l'abonnement ou l'essai est terminé ;
 *  - "LECTURE_SEULE" : consultation et exports seulement ;
 *  - "SUSPENDU"      : lecture seule parce que la plateforme a suspendu l'abonnement (pas de grâce).
 * @returns {{ type: string, jours: number|null, date: string|null } | null}
 */
export function bandeauAcces(etat) {
  const acces = etat?.acces;
  if (!acces || acces.mode === "COMPLET") return null;
  if (acces.mode === "GRACE") {
    return { type: "GRACE", jours: acces.joursGraceRestants ?? null, date: acces.graceJusquAu ?? null };
  }
  if (acces.mode === "LECTURE_SEULE") {
    return { type: etat.statut === "SUSPENDU" ? "SUSPENDU" : "LECTURE_SEULE", jours: null, date: acces.graceJusquAu ?? null };
  }
  return null;
}

/** Peut-on ouvrir une nouvelle déclaration ? Une seule à la fois par atelier (le serveur l'impose aussi). */
export const peutDeclarer = (etat) => Boolean(etat) && !etat.paiementEnAttente;

/** Le retour de Wave porte `?paiement=retour|echec&transaction=<numéro>` : lecture défensive de ces paramètres. */
export function retourPaiement(search) {
  const params = new URLSearchParams(search);
  const resultat = params.get("paiement");
  const transaction = params.get("transaction");
  if (!["retour", "echec"].includes(resultat) || !transaction || transaction.length > 40) return null;
  return { resultat, transaction };
}
