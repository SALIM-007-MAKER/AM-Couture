// Indicateurs commerciaux de la plateforme pour le SUPERADMIN : ateliers par état, revenus, renouvellements.
// Fonctions PURES (aucun accès à la base) : elles reçoivent des lignes déjà lues, ce qui les rend testables avec des
// dates fixes. Les lectures sont dans routes/commerce.routes.js.
//
// Définitions (à lire avant d'interpréter un chiffre) :
//  - encaissement = transaction d'abonnement CONFIRMÉE (REUSSIE), daté du jour de la confirmation ; remboursement =
//    transaction REMBOURSEE, daté du jour du remboursement ; net = encaissements − remboursements du mois ;
//  - MRR (revenu mensuel récurrent) = somme de prix ÷ durée (en mois) des abonnements ACTIFS aujourd'hui ;
//  - renouvelé = un abonnement échu pendant la période a été suivi d'un autre qui commence au plus un jour avant son
//    échéance et au plus (jours de grâce) après, et qui va plus loin ;
//  - converti = atelier dont l'essai s'est terminé pendant la période et qui possède (ou a possédé) un abonnement confirmé.
import { Prisma } from "../generated/prisma/client.ts";
import { etatAbonnementAtelier, modeAcces, statutEffectif, finDeChaine } from "./abonnement.js";

const JOUR = 86_400_000;
export const ETATS_ABONNEMENT = ["ACTIF", "ESSAI", "EN_ATTENTE", "EXPIRE", "SUSPENDU", "AUCUN"];
export const MODES_ACCES = ["COMPLET", "GRACE", "LECTURE_SEULE"];

const compter = (valeurs) => Object.fromEntries(valeurs.map((v) => [v, 0]));

/** Ateliers par état d'abonnement et par mode d'accès. Les ateliers suspendus par la plateforme sont comptés à part. */
export function bilanAteliers(ateliers, { joursGrace }, now = new Date()) {
  const parEtat = compter(ETATS_ABONNEMENT);
  const parAcces = compter(MODES_ACCES);
  let actifs = 0;
  for (const a of ateliers) {
    if (!a.actif) continue;
    actifs += 1;
    const etat = etatAbonnementAtelier({ trialEndsAt: a.trialEndsAt }, a.abonnements, now);
    parEtat[etat.statut] += 1;
    parAcces[modeAcces(etat, a.abonnements, { joursGrace }, now).mode] += 1;
  }
  return { total: ateliers.length, actifs, suspendus: ateliers.length - actifs, parEtat, parAcces };
}

/** Revenu mensuel récurrent : prix ÷ durée de chaque abonnement ACTIF. Renvoie un Decimal arrondi à 2 décimales. */
export function revenuMensuelRecurrent(abonnements, now = new Date()) {
  let total = new Prisma.Decimal(0);
  for (const a of abonnements) {
    if (a.statut !== "CONFIRME" || statutEffectif(a, now) !== "ACTIF" || !a.dureeMois || a.dureeMois <= 0) continue;
    total = total.plus(new Prisma.Decimal(a.prix).div(a.dureeMois));
  }
  return total.toDecimalPlaces(2);
}

/** Mois de la fenêtre au format AAAA-MM (UTC), du plus ancien au courant. */
export function moisDeLaFenetre(nombre, now = new Date()) {
  return Array.from({ length: nombre }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (nombre - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/**
 * Série mensuelle des revenus. `encaissements` et `remboursements` : [{ mois: "AAAA-MM", total, nombre }] déjà
 * agrégés par la base. Les mois sans mouvement sont présents, à zéro.
 */
export function serieRevenus(encaissements, remboursements, nombreMois, now = new Date()) {
  const index = (lignes) => new Map(lignes.map((l) => [l.mois, l]));
  const enc = index(encaissements);
  const remb = index(remboursements);
  return moisDeLaFenetre(nombreMois, now).map((mois) => {
    const e = new Prisma.Decimal(enc.get(mois)?.total ?? 0);
    const r = new Prisma.Decimal(remb.get(mois)?.total ?? 0);
    return {
      mois,
      encaisse: e.toString(),
      rembourse: r.toString(),
      net: e.minus(r).toString(),
      nombrePaiements: enc.get(mois)?.nombre ?? 0,
      nombreRemboursements: remb.get(mois)?.nombre ?? 0,
    };
  });
}

const sommer = (lignes) => lignes.reduce((acc, l) => acc.plus(new Prisma.Decimal(l.total)), new Prisma.Decimal(0));

export function totauxRevenus(serie) {
  return {
    encaisse: sommer(serie.map((s) => ({ total: s.encaisse }))).toString(),
    rembourse: sommer(serie.map((s) => ({ total: s.rembourse }))).toString(),
    net: sommer(serie.map((s) => ({ total: s.net }))).toString(),
  };
}

/**
 * Renouvellements à surveiller. Chaque atelier actif apparaît dans au plus une liste :
 *  - aRenouveler : couverture en cours qui s'achève dans l'horizon (renouvellements planifiés déjà pris en compte) ;
 *  - recemmentExpires : couverture terminée depuis moins de `fenetreExpiresJours` jours et non reprise ;
 *  - essaisQuiFinissent : essai gratuit qui s'achève dans l'horizon, sans abonnement.
 */
export function renouvellementsASuivre(ateliers, { horizonJours, fenetreExpiresJours = 30, joursGrace }, now = new Date()) {
  const horizon = new Date(now.getTime() + horizonJours * JOUR);
  const resultat = { aRenouveler: [], recemmentExpires: [], essaisQuiFinissent: [] };

  for (const a of ateliers) {
    if (!a.actif) continue;
    const base = { atelierId: a.id, nom: a.nom, telephone: a.telephone ?? null, email: a.emailContact ?? null, paiementEnAttente: Boolean(a.paiementEnAttente) };
    const etat = etatAbonnementAtelier({ trialEndsAt: a.trialEndsAt }, a.abonnements, now);

    if (etat.statut === "ACTIF") {
      const fin = finDeChaine(a.abonnements, now);
      if (fin && fin <= horizon) {
        resultat.aRenouveler.push({
          ...base,
          finLe: fin,
          joursRestants: Math.ceil((fin.getTime() - now.getTime()) / JOUR),
          planNom: etat.abonnement?.planNom ?? null,
        });
      }
    } else if (etat.statut === "ESSAI") {
      const fin = new Date(a.trialEndsAt);
      if (fin <= horizon) {
        resultat.essaisQuiFinissent.push({ ...base, finLe: fin, joursRestants: Math.ceil((fin.getTime() - now.getTime()) / JOUR) });
      }
    } else if (etat.statut === "EXPIRE") {
      const aEuUnAbonnement = a.abonnements.some((x) => x.statut === "CONFIRME");
      const finDroit = new Date(
        Math.max(
          ...[a.trialEndsAt, ...a.abonnements.filter((x) => x.statut === "CONFIRME").map((x) => x.dateExpiration)]
            .filter(Boolean)
            .map((d) => new Date(d).getTime()),
        ),
      );
      const joursDepuis = Math.floor((now.getTime() - finDroit.getTime()) / JOUR);
      // Seuls les anciens abonnés sont à relancer ici ; les essais terminés relèvent de la conversion (bilanConversion).
      if (aEuUnAbonnement && joursDepuis <= fenetreExpiresJours) {
        resultat.recemmentExpires.push({
          ...base,
          finLe: finDroit,
          joursDepuis,
          acces: modeAcces(etat, a.abonnements, { joursGrace }, now).mode,
          planNom: etat.abonnement?.planNom ?? null,
        });
      }
    }
  }
  const parDate = (x, y) => new Date(x.finLe) - new Date(y.finLe);
  resultat.aRenouveler.sort(parDate);
  resultat.essaisQuiFinissent.sort(parDate);
  resultat.recemmentExpires.sort((x, y) => new Date(y.finLe) - new Date(x.finLe));
  return resultat;
}

/** Part des abonnements échus pendant la période qui ont été renouvelés (voir définition en tête de fichier). */
export function tauxRenouvellement(ateliers, { periodeJours = 90, joursGrace }, now = new Date()) {
  const debut = new Date(now.getTime() - periodeJours * JOUR);
  let echus = 0;
  let renouveles = 0;
  for (const a of ateliers) {
    const confirmes = a.abonnements.filter((x) => x.statut === "CONFIRME" && x.dateDebut && x.dateExpiration);
    for (const x of confirmes) {
      const fin = new Date(x.dateExpiration);
      if (fin < debut || fin >= now) continue;
      echus += 1;
      const suivi = confirmes.some(
        (y) =>
          y !== x &&
          new Date(y.dateExpiration) > fin &&
          new Date(y.dateDebut).getTime() >= fin.getTime() - JOUR &&
          new Date(y.dateDebut).getTime() <= fin.getTime() + joursGrace * JOUR,
      );
      if (suivi) renouveles += 1;
    }
  }
  return { periodeJours, echus, renouveles, taux: echus === 0 ? null : Math.round((renouveles / echus) * 1000) / 10 };
}

/** Parmi les ateliers dont l'essai s'est terminé pendant la période, part de ceux qui ont (eu) un abonnement confirmé. */
export function bilanConversion(ateliers, { periodeJours = 90 }, now = new Date()) {
  const debut = new Date(now.getTime() - periodeJours * JOUR);
  let essaisTermines = 0;
  let convertis = 0;
  for (const a of ateliers) {
    if (!a.trialEndsAt) continue;
    const fin = new Date(a.trialEndsAt);
    if (fin < debut || fin >= now) continue;
    essaisTermines += 1;
    if (a.abonnements.some((x) => x.statut === "CONFIRME" || x.statut === "SUSPENDU")) convertis += 1;
  }
  return { periodeJours, essaisTermines, convertis, taux: essaisTermines === 0 ? null : Math.round((convertis / essaisTermines) * 1000) / 10 };
}
