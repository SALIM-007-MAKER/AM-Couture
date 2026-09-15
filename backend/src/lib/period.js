// Résolution des périodes du Dashboard/Rapports — TOUJOURS en UTC.
//
// Convention reprise de lib/dateField.js (déjà en place dans tout le projet
// pour Dépenses/Commandes) : aucune notion de fuseau horaire n'existe dans
// le schéma (Atelier n'a pas de champ "timezone"), donc UTC est la seule
// référence temporelle cohérente déjà établie ailleurs dans le code — on
// l'étend ici plutôt que d'en inventer une nouvelle. Abidjan (devise FCFA
// par défaut) est en UTC+0 sans heure d'été, donc ce choix correspond de
// toute façon à l'heure locale probable de l'atelier ; à confirmer si
// l'atelier opère dans un autre fuseau (voir rapport, point ouvert).
//
// Borne de fin TOUJOURS exclusive (`lt`), jamais `lte` — même convention que
// dateRangeEndField (lib/dateField.js) : évite tout nombre "magique"
// 23:59:59.999 et reste cohérent quelle que soit la précision de la donnée.

export const PERIODES = ["today", "week", "month", "quarter", "year"];

function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d, n) {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
function startOfUtcMonth(d, offsetMonths = 0) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1));
}

/** Calcule les bornes [from, to[ d'un préréglage ("today"/"week"/...), ancré sur `now`. */
export function computePeriodBounds(period, now = new Date()) {
  const today = startOfUtcDay(now);
  switch (period) {
    case "today":
      return { from: today, to: addDays(today, 1) };
    case "week": {
      // Lundi comme premier jour de semaine (convention ISO-8601 / usage FR).
      const dow = today.getUTCDay(); // 0 = dimanche .. 6 = samedi
      const diffToMonday = (dow + 6) % 7;
      const monday = addDays(today, -diffToMonday);
      return { from: monday, to: addDays(monday, 7) };
    }
    case "month": {
      const from = startOfUtcMonth(today);
      return { from, to: startOfUtcMonth(today, 1) };
    }
    case "quarter": {
      const qStartMonth = Math.floor(today.getUTCMonth() / 3) * 3;
      const from = new Date(Date.UTC(today.getUTCFullYear(), qStartMonth, 1));
      return { from, to: new Date(Date.UTC(today.getUTCFullYear(), qStartMonth + 3, 1)) };
    }
    case "year": {
      const from = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      return { from, to: new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 1)) };
    }
    default:
      return { from: undefined, to: undefined };
  }
}

/**
 * Résout les bornes effectives { from, to } à appliquer à un filtre Prisma
 * `{ gte: from, lt: to }`. Une période personnalisée (`from`/`to` explicites,
 * déjà validés par Zod) est TOUJOURS prioritaire sur `period` — l'un ou
 * l'autre suffit à activer le filtre (from seul = "depuis...", to seul =
 * "jusqu'à..."). Sans aucun des deux : aucun filtre (portée globale).
 */
export function resolvePeriod({ period, from, to }) {
  if (from || to) return { from, to };
  if (period) return computePeriodBounds(period);
  return { from: undefined, to: undefined };
}

/** Construit un objet `where.<champ>` Prisma à partir de bornes {from,to} déjà résolues. */
export function dateRangeWhere(from, to) {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
}

// ── Regroupement mensuel (évolution) ──────────────────────────────────────

export const MAX_EVOLUTION_MONTHS = 60; // 5 ans — garde-fou anti-plage-énorme (§14)

export function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Bornes par défaut de /rapports/evolution quand from/to ne sont pas fournis : les 12 derniers mois (mois courant inclus). */
export function defaultEvolutionRange(now = new Date()) {
  const from = startOfUtcMonth(now, -11);
  const to = startOfUtcMonth(now, 1);
  return { from, to };
}

/** Liste des 1ers-du-mois entre from (inclus) et to (exclusif). */
export function monthsInRange(from, to) {
  const months = [];
  let cur = startOfUtcMonth(from);
  const end = startOfUtcMonth(to);
  while (cur < end) {
    months.push(cur);
    cur = startOfUtcMonth(cur, 1);
  }
  return months;
}

// ── Comparaison à la période précédente (§ stats comparatives) ────────────

function estDebutDeMoisUtc(d) {
  return (
    d.getUTCDate() === 1 && d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0
  );
}

/**
 * Bornes [from, to[ de la période immédiatement précédente.
 *
 * Deux stratégies selon la forme de [from, to[ :
 * - les DEUX bornes tombent le 1er d'un mois (cas des préréglages
 *   "month"/"quarter"/"year", ou d'une plage personnalisée qui coïncide
 *   avec des mois calendaires pleins) : décalage d'autant de MOIS CIVILS
 *   que la période en couvre (1, 3, 12...) — nécessaire car les mois n'ont
 *   pas tous la même durée (un décalage par durée fixe donnerait "1er août"
 *   -> "2 août" pour le mois précédent de septembre, faux d'un jour).
 * - sinon (préréglages "today"/"week", ou plage personnalisée quelconque) :
 *   décalage par la DURÉE exacte de la période, seule notion qui ait un
 *   sens hors alignement calendaire.
 *
 * `null` si la période n'est pas bornée des deux côtés (ex: "from seul" —
 * une comparaison n'a de sens que pour un intervalle fini).
 */
export function previousPeriodBounds(from, to) {
  if (!from || !to) return null;
  if (estDebutDeMoisUtc(from) && estDebutDeMoisUtc(to)) {
    const nombreDeMois = monthsInRange(from, to).length;
    return { from: startOfUtcMonth(from, -nombreDeMois), to: from };
  }
  const duree = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - duree), to: from };
}

/**
 * Variation en % entre deux valeurs (Decimal, string ou number — converties
 * via Number, une imprécision négligeable pour un indicateur d'affichage,
 * jamais une valeur financière stockée). `null` quand non calculable
 * (précédent = 0 et actuel ≠ 0 : la notion de "% depuis zéro" n'a pas de
 * sens, le frontend affiche alors "Nouveau" plutôt qu'un pourcentage
 * trompeur). précédent = actuel = 0 -> 0 (pas de changement), jamais null.
 */
export function variationPct(actuel, precedent) {
  const a = Number(actuel);
  const p = Number(precedent);
  if (p === 0) return a === 0 ? 0 : null;
  return Math.round(((a - p) / p) * 1000) / 10;
}
