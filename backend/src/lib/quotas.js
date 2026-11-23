// QUOTAS COMMERCIAUX des formules d'abonnement — règles PURES (aucun accès à la base), partagées par les routes, le calcul
// d'utilisation et les tests. L'accès à la base (comptage, verrous) est dans quotasServeur.js.
//
// Principes (décisions de novembre 2026) :
//  - une formule limite quatre ressources : clientes, employes, commandesActives, modeles. Une clé ABSENTE = illimité ;
//    les valeurs sont des entiers de 1 à 1 000 000 (zéro interdit) ;
//  - les limites sont FIGÉES dans chaque abonnement (Abonnement.limites), comme le prix : modifier une formule du
//    catalogue ne touche que les futures souscriptions ;
//  - l'essai gratuit n'a aucun quota ; un atelier sans abonnement non plus ;
//  - PLANCHER D'USAGE : un atelier ANCIEN (sans échéance d'essai) qui souscrit pour la première fois ne peut pas avoir une
//    limite effective inférieure à son usage réel au moment de l'activation (usage mesuré pour les quatre ressources, même si la
//    première formule est illimitée). Le plancher est enregistré (Abonnement.plancher),
//    reporté tel quel à chaque abonnement suivant, et ne se recalcule jamais ;
//  - aucune donnée n'est jamais supprimée ni masquée pour appliquer un quota : seule la CRÉATION de la ressource est refusée.
import { statutEffectif } from "./abonnement.js";

export const RESSOURCES = ["clientes", "employes", "commandesActives", "modeles"];
export const LIMITE_MIN = 1;
export const LIMITE_MAX = 1_000_000;

const estLimiteValide = (v) => Number.isInteger(v) && v >= LIMITE_MIN && v <= LIMITE_MAX;

/**
 * Ne garde d'un JSON de limites que les clés connues à valeur valide (lecture défensive : une valeur illisible en base
 * est ignorée, donc illimitée, plutôt que de bloquer un atelier sur une donnée corrompue).
 */
export function normaliserLimites(brut) {
  const sortie = {};
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return sortie;
  for (const cle of RESSOURCES) if (estLimiteValide(brut[cle])) sortie[cle] = brut[cle];
  return sortie;
}

/** Limite effective = max(limite de la formule, plancher), pour les seules ressources que la formule limite. */
export function limitesEffectives(limitesFormule, plancher) {
  const formule = normaliserLimites(limitesFormule);
  const sol = normaliserLimites(plancher);
  const sortie = {};
  for (const cle of Object.keys(formule)) sortie[cle] = Math.max(formule[cle], sol[cle] ?? 0);
  return sortie;
}

/**
 * Plancher d'un premier abonnement : l'usage réel de chaque ressource au moment de l'activation (au moins 1), quelle que soit
 * la formule. Il ne sert que si la limite d'une formule est inférieure ; il est enregistré même pour une formule illimitée
 * (Premium), afin de protéger l'usage de l'atelier s'il passe plus tard à une formule limitée.
 */
export function plancherInitial(usages) {
  const sortie = {};
  for (const cle of RESSOURCES) {
    const usage = Math.floor(Number(usages?.[cle] ?? 0));
    if (usage >= LIMITE_MIN) sortie[cle] = Math.min(usage, LIMITE_MAX);
  }
  return sortie;
}

/** Plancher reporté : le plus élevé par ressource parmi les abonnements précédents (ils sont identiques en pratique). */
export function planchersFusionnes(abonnements) {
  const sortie = {};
  for (const a of abonnements) {
    const p = normaliserLimites(a.plancher);
    for (const cle of Object.keys(p)) sortie[cle] = Math.max(sortie[cle] ?? 0, p[cle]);
  }
  return sortie;
}

/** Un abonnement a-t-il déjà été activé ? (une date de début n'est posée qu'à l'activation) */
const aEteActive = (a) => Boolean(a.dateDebut);

/**
 * Éligibilité au calcul du plancher : atelier ANCIEN (aucune échéance d'essai) qui n'a jamais eu d'abonnement activé,
 * quel que soit son état actuel. Un atelier qui a bénéficié de l'essai n'a pas de plancher (quotas stricts à la fin de l'essai).
 * `autres` = les autres abonnements de l'atelier (celui qu'on active exclu).
 */
export function estEligiblePlancher(atelier, autres) {
  return !atelier?.trialEndsAt && !autres.some(aEteActive);
}

/**
 * Limites à figer dans un abonnement qu'on active ou corrige.
 *  - `limitesFormule` : limites de la formule (catalogue) à cet instant ;
 *  - `autres` : les autres abonnements de l'atelier ({ dateDebut, plancher }) ;
 *  - `usages` : usage réel par ressource, nécessaire (et seulement lu) si l'atelier est éligible au plancher.
 * Renvoie { limites, plancher } : `limites` = ce que les contrôles appliquent, `plancher` = ce qui est reporté.
 */
export function figerLimites({ limitesFormule, atelier, autres = [], usages = null }) {
  const herite = planchersFusionnes(autres);
  const plancher = estEligiblePlancher(atelier, autres) ? plancherInitial(usages ?? {}) : herite;
  return { limites: limitesEffectives(limitesFormule, plancher), plancher };
}

/**
 * CORRECTION d'un abonnement déjà activé (changement de formule par le SUPERADMIN) : les limites sont recalculées depuis la
 * nouvelle formule ; le plancher historique est conservé INTÉGRALEMENT (celui de l'abonnement corrigé et des autres), sans
 * nouvelle mesure de l'usage — même s'il devient temporairement inférieur à la limite de la formule.
 */
export function recalculerLimites({ limitesFormule, abonnement, autres = [] }) {
  const plancher = planchersFusionnes([abonnement, ...autres]);
  return { limites: limitesEffectives(limitesFormule, plancher), plancher };
}

/**
 * Limites en vigueur pour un atelier à l'instant `now`. `null` = aucun quota.
 *  - essai gratuit en cours : aucun (même si un abonnement est déjà activé) ;
 *  - abonnement actif : ses limites figées ;
 *  - période de grâce (abonnement échu) : celles du DERNIER abonnement échu ;
 *  - suspension : celles de l'abonnement suspendu (l'écriture est de toute façon refusée en lecture seule) ;
 *  - sinon (jamais abonné, ou ancien atelier) : aucun.
 * `abonnements` : { statut, dateDebut, dateExpiration, limites }.
 */
export function limitesApplicables({ trialEndsAt }, abonnements, now = new Date()) {
  if (trialEndsAt && now < new Date(trialEndsAt)) return { limites: null, raison: "ESSAI" };

  const confirmes = abonnements.filter((a) => a.statut === "CONFIRME");
  const parFinDesc = (a, b) => new Date(b.dateExpiration) - new Date(a.dateExpiration);

  const actif = confirmes.filter((a) => statutEffectif(a, now) === "ACTIF").sort(parFinDesc)[0];
  if (actif) return { limites: normaliserLimites(actif.limites), raison: "ABONNEMENT", abonnement: actif };

  const suspendu = abonnements
    .filter((a) => a.statut === "SUSPENDU" && a.dateExpiration && new Date(a.dateExpiration) > now)
    .sort(parFinDesc)[0];
  if (suspendu) return { limites: normaliserLimites(suspendu.limites), raison: "SUSPENDU", abonnement: suspendu };

  const echu = confirmes.filter((a) => statutEffectif(a, now) === "EXPIRE").sort(parFinDesc)[0];
  if (echu) return { limites: normaliserLimites(echu.limites), raison: "GRACE", abonnement: echu };

  return { limites: null, raison: "AUCUN" };
}

/** Seuil à partir duquel une jauge passe en « proche » (orange). */
export const SEUIL_PROCHE = 0.8;

/** État d'une jauge : illimite | ok | proche | atteint | depasse. */
export function etatJauge(usage, limite) {
  if (limite == null) return "illimite";
  if (usage > limite) return "depasse";
  if (usage === limite) return "atteint";
  return usage >= limite * SEUIL_PROCHE ? "proche" : "ok";
}

/** Peut-on ajouter `ajout` éléments ? (illimité : toujours) */
export function peutAjouter(usage, limite, ajout = 1) {
  return limite == null || usage + ajout <= limite;
}

/** Les quatre jauges d'un atelier, prêtes pour l'API et l'interface. */
export function jauges(usages, limites, plancher = {}) {
  const sol = normaliserLimites(plancher);
  return RESSOURCES.map((cle) => {
    const limite = limites?.[cle] ?? null;
    const usage = Number(usages?.[cle] ?? 0);
    return { cle, usage, limite, etat: etatJauge(usage, limite), plancherApplique: limite != null && sol[cle] != null && limite === sol[cle] };
  });
}
