// LOGIQUE D'ABONNEMENT (Subscription) — volontairement indépendante du
// paiement (voir lib/payments/, dormant tant qu'aucune clé API n'existe) :
// aujourd'hui un abonnement est activé MANUELLEMENT par le SUPERADMIN (voir
// ateliersAbonnement.routes.js) ; le jour où un paiement en ligne existe, il
// appellera simplement les mêmes fonctions (activerAbonnement) — la logique
// d'abonnement elle-même ne change pas.

// Calcule dateExpiration = dateDebut + dureeMois — arithmétique CALENDAIRE
// (setUTCMonth), pas "+ dureeMois*30 jours" : un abonnement "3 mois" doit
// couvrir 3 mois civils, quelle que soit leur longueur réelle (28 à 31
// jours), sinon un abonnement de 12 mois perdrait plusieurs jours par an.
export function calculerDateExpiration(dateDebut, dureeMois) {
  const d = new Date(dateDebut);
  d.setUTCMonth(d.getUTCMonth() + dureeMois);
  return d;
}

// "ACTIF"/"EXPIRE" ne sont JAMAIS stockés — dérivés à la lecture à partir de
// statut + dates, même principe que statutPaiement() (money.js) : une valeur
// recalculable ne doit jamais pouvoir diverger de la réalité en base.
// EN_ATTENTE (effectif) = pas encore activé : soit jamais confirmé, soit
// confirmé avec une date de début dans le futur (activation planifiée).
export function statutEffectif(abonnement, now = new Date()) {
  if (abonnement.statut === "ANNULE") return "ANNULE";
  if (abonnement.statut === "EN_ATTENTE") return "EN_ATTENTE";
  // CONFIRME
  if (abonnement.dateDebut && new Date(abonnement.dateDebut) > now) return "EN_ATTENTE";
  if (abonnement.dateExpiration && new Date(abonnement.dateExpiration) > now) return "ACTIF";
  return "EXPIRE";
}

const MS_PAR_JOUR = 86_400_000;

export function joursRestants(date, now = new Date()) {
  return Math.max(0, Math.ceil((new Date(date).getTime() - now.getTime()) / MS_PAR_JOUR));
}

/**
 * État d'abonnement d'un atelier, tel qu'affiché au PDG et au SUPERADMIN :
 *   ACTIF      un abonnement confirmé couvre aujourd'hui
 *   EN_ATTENTE une activation planifiée (date de début future) existe
 *   ESSAI      pas d'abonnement mais l'essai gratuit court encore
 *   EXPIRE     dernier abonnement échu, ou essai terminé sans abonnement
 *   AUCUN      atelier antérieur à l'essai gratuit (trialEndsAt null), sans abonnement
 * Priorité dans cet ordre : un abonnement actif l'emporte toujours sur l'essai.
 * `abonnements` = tous les abonnements de l'atelier (n'importe quel ordre).
 */
export function etatAbonnementAtelier({ trialEndsAt }, abonnements, now = new Date()) {
  const confirmes = abonnements.filter((a) => a.statut === "CONFIRME");
  const parStatut = (s) => confirmes.filter((a) => statutEffectif(a, now) === s);

  const essai = trialEndsAt
    ? { trialEndsAt, actif: now < new Date(trialEndsAt), joursRestants: joursRestants(trialEndsAt, now) }
    : null;

  const actifs = parStatut("ACTIF").sort((a, b) => new Date(b.dateExpiration) - new Date(a.dateExpiration));
  if (actifs[0]) return { statut: "ACTIF", abonnement: actifs[0], essai };

  const planifies = parStatut("EN_ATTENTE").sort((a, b) => new Date(a.dateDebut) - new Date(b.dateDebut));
  if (planifies[0]) return { statut: "EN_ATTENTE", abonnement: planifies[0], essai };

  if (essai?.actif) return { statut: "ESSAI", abonnement: null, essai };

  const expires = parStatut("EXPIRE").sort((a, b) => new Date(b.dateExpiration) - new Date(a.dateExpiration));
  if (expires[0]) return { statut: "EXPIRE", abonnement: expires[0], essai };

  return { statut: essai ? "EXPIRE" : "AUCUN", abonnement: null, essai };
}

// Seul point d'activation d'un abonnement dans la base de code — utilisé par
// l'activation manuelle (SUPERADMIN) et, plus tard, par la confirmation d'un
// paiement en ligne. `tx` est TOUJOURS un client Prisma en transaction.
export async function activerAbonnement(tx, { abonnementId, dureeMois }, maintenant = new Date()) {
  const dateExpiration = calculerDateExpiration(maintenant, dureeMois);
  await tx.abonnement.update({
    where: { id: abonnementId },
    data: { statut: "CONFIRME", dateDebut: maintenant, dateExpiration },
  });
  return dateExpiration;
}
