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
  if (abonnement.statut === "SUSPENDU") return "SUSPENDU";
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
  // Abonnement suspendu par la plateforme et dont la période n'est pas échue : état à part (ni actif, ni simplement
  // expiré) pour que l'atelier et le SUPERADMIN voient POURQUOI l'accès est restreint.
  const suspendus = abonnements
    .filter((a) => a.statut === "SUSPENDU" && a.dateExpiration && new Date(a.dateExpiration) > now)
    .sort((a, b) => new Date(b.dateExpiration) - new Date(a.dateExpiration));
  if (suspendus[0]) return { statut: "SUSPENDU", abonnement: suspendus[0], essai };

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

// ── Tarification par durée ────────────────────────────────────────────────
// Un plan a un prix MENSUEL et une liste de durées proposées avec remise :
// [{ dureeMois, remisePourcent }]. Vide = durées standard sans remise.
// SEULE règle de calcul du prix d'une durée — utilisée pour l'affichage (liste
// des plans, PDG et SuperAdmin) ET pour le prix figé à l'activation, afin que
// les deux ne divergent jamais.
export const DUREES_STANDARD = [1, 3, 6, 12];

export function tarifsDuree(plan) {
  const configures = Array.isArray(plan.tarifsDuree) ? plan.tarifsDuree : [];
  const base = configures.length > 0 ? configures : DUREES_STANDARD.map((dureeMois) => ({ dureeMois, remisePourcent: 0 }));
  return base
    .map((t) => ({ dureeMois: t.dureeMois, remisePourcent: Number(t.remisePourcent) || 0 }))
    .sort((a, b) => a.dureeMois - b.dureeMois);
}

/** Prix total (Decimal, 2 décimales) d'un plan pour `dureeMois` mois ; remise appliquée si la durée est proposée. */
export function prixPourDuree(plan, dureeMois) {
  const tarif = tarifsDuree(plan).find((t) => t.dureeMois === dureeMois);
  const remise = tarif?.remisePourcent ?? 0;
  return plan.prixMensuel
    .mul(dureeMois)
    .mul(100 - remise)
    .div(100)
    .toDecimalPlaces(2);
}

/** Plan tel qu'exposé par l'API : tarifs par durée avec total calculé par le serveur. */
export function planAvecTarifs(plan) {
  return {
    ...plan,
    tarifs: tarifsDuree(plan).map((t) => ({ ...t, total: prixPourDuree(plan, t.dureeMois) })),
  };
}

// ── Accès selon l'état d'abonnement ───────────────────────────────────────
// Règle (décision du 15/11/2026) : à la fin d'un essai ou d'un abonnement, l'atelier garde l'accès COMPLET pendant
// `joursGrace` jours (bandeau d'avertissement), puis passe en LECTURE SEULE : il consulte et exporte ses données,
// il n'en crée ni n'en modifie plus. Aucune donnée n'est jamais supprimée ni masquée. Un abonnement SUSPENDU par
// la plateforme n'a pas de grâce : la suspension est une décision, pas un oubli de paiement.
export const MODES_ACCES = ["COMPLET", "GRACE", "LECTURE_SEULE"];

/**
 * @param etat résultat de etatAbonnementAtelier()
 * @param abonnements tous les abonnements de l'atelier (la grâce court depuis la fin des DERNIERS droits échus)
 * @param {{ joursGrace: number }} options
 * @returns {{ mode: "COMPLET"|"GRACE"|"LECTURE_SEULE", graceJusquAu: Date|null, joursGraceRestants: number|null }}
 */
export function modeAcces(etat, abonnements, { joursGrace }, now = new Date()) {
  const complet = { mode: "COMPLET", graceJusquAu: null, joursGraceRestants: null };
  if (etat.statut === "AUCUN" || etat.statut === "ACTIF" || etat.statut === "ESSAI") return complet;
  if (etat.statut === "SUSPENDU") return { mode: "LECTURE_SEULE", graceJusquAu: null, joursGraceRestants: null };

  // EXPIRE ou EN_ATTENTE (activation planifiée pas encore commencée) : la grâce court depuis la fin des derniers
  // droits connus (essai ou abonnement échu), la plus tardive des deux.
  const fins = [
    etat.essai?.trialEndsAt,
    ...abonnements.filter((a) => a.statut === "CONFIRME").map((a) => a.dateExpiration),
  ]
    .filter(Boolean)
    .map((d) => new Date(d))
    .filter((d) => d <= now);
  if (fins.length === 0) return { mode: "LECTURE_SEULE", graceJusquAu: null, joursGraceRestants: null };
  const finDroits = new Date(Math.max(...fins.map((d) => d.getTime())));
  const graceJusquAu = new Date(finDroits.getTime() + joursGrace * MS_PAR_JOUR);
  if (now < graceJusquAu) {
    return { mode: "GRACE", graceJusquAu, joursGraceRestants: joursRestants(graceJusquAu, now) };
  }
  return { mode: "LECTURE_SEULE", graceJusquAu, joursGraceRestants: 0 };
}

/**
 * Date de début d'un nouvel abonnement souscrit par un atelier : maintenant, ou la fin de l'abonnement confirmé qui
 * court encore (le plus tardif), de sorte qu'un renouvellement ANTICIPÉ ne fait jamais perdre les jours restants.
 */
export function dateDebutSouscription(abonnements, now = new Date()) {
  const fins = abonnements
    .filter((a) => a.statut === "CONFIRME" && a.dateExpiration && new Date(a.dateExpiration) > now)
    .map((a) => new Date(a.dateExpiration));
  return fins.length > 0 ? new Date(Math.max(...fins.map((d) => d.getTime()))) : now;
}
