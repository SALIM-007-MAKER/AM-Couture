import { z } from "zod";

// Grammaire ISO 8601 STRICTE (année-mois-jour zéro-paddés obligatoires).
// On rejette délibérément tout ce qui n'est pas ce format exact : un format
// non strictement conforme (ex: "2026-9-10", sans zéro de tête) fait basculer
// le moteur JS sur une interprétation locale au lieu d'UTC — piège silencieux
// qu'on élimine en amont plutôt que de laisser `new Date()` deviner.
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

const MIN_YEAR = 2000;
const MAX_YEAR_AHEAD = 10; // années dans le futur au-delà desquelles une date est jugée absurde

function isValidCalendarDate(year, month, day) {
  if (month < 1 || month > 12) return false;
  // Jour 0 du mois suivant = dernier jour du mois demandé (gère les années
  // bissextiles correctement, arithmétique Date.UTC standard et sûre ici
  // car les entrées sont déjà validées comme des entiers par la regex).
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

/**
 * Valide et parse une date ISO 8601 stricte (AAAA-MM-JJ ou
 * AAAA-MM-JJTHH:mm:ssZ). Rejette explicitement :
 * - les formats ambigus/non conformes (dates locales, slashes, etc.) ;
 * - les dates calendaires inexistantes (31 avril, 30 février...) que
 *   `new Date()` accepterait silencieusement en "débordant" sur le mois
 *   suivant ;
 * - les années hors bornes raisonnables.
 */
function parseStrictIsoDate(raw, ctx) {
  const match = DATE_ONLY_RE.exec(raw) || DATETIME_RE.exec(raw);
  if (!match) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Date invalide (format ISO 8601 attendu : AAAA-MM-JJ ou AAAA-MM-JJTHH:mm:ssZ).",
    });
    return z.NEVER;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!isValidCalendarDate(year, month, day)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date invalide : ce jour n'existe pas dans ce mois." });
    return z.NEVER;
  }
  if (year < MIN_YEAR || year > new Date().getUTCFullYear() + MAX_YEAR_AHEAD) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Année hors limites raisonnables." });
    return z.NEVER;
  }

  // Le format est maintenant garanti strictement conforme : interprétation
  // UTC fiable (pas de fallback local possible à ce stade).
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date invalide." });
    return z.NEVER;
  }
  return date;
}

export const dateField = z.string().trim().transform(parseStrictIsoDate);

/**
 * Borne DE FIN d'un filtre de plage de dates (ex: ?dateTo=2026-09-04).
 *
 * Convention documentée : si la valeur fournie est une date seule (sans
 * heure), on avance au tout début du jour SUIVANT — à utiliser avec un
 * critère "< " (exclusif) côté requête, afin d'inclure toute la journée
 * demandée (jusqu'à 23:59:59.999) sans dépendre d'un nombre "magique"
 * (23:59:59.999) qui casserait avec une précision plus fine. Si un
 * horodatage précis est fourni (avec heure), il est utilisé tel quel comme
 * borne exclusive exacte — aucun décalage n'est appliqué.
 *
 * Sans cette distinction, filtrer "toute la journée du 4 septembre" avec
 * `lte: 2026-09-04T00:00:00.000Z` exclurait silencieusement la quasi-totalité
 * de la journée (tout ce qui a une heure > 00:00:00 ce jour-là).
 */
export const dateRangeEndField = z.string().trim().transform((raw, ctx) => {
  const date = parseStrictIsoDate(raw, ctx);
  if (date === z.NEVER) return z.NEVER;
  if (DATE_ONLY_RE.test(raw.trim())) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
});
