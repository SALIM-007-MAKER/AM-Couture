// Classement CENTRAL des erreurs : transforme n'importe quelle erreur levée par une route en une
// réponse HTTP sûre (statut, message en français, jamais de détail interne). Les formes d'erreur
// ont été observées sur Prisma 7 + @prisma/adapter-pg (voir docs/ERREURS.md).
import { HttpError } from "./httpError.js";

export const MESSAGE_INTERNE = "Une erreur est survenue.";
export const MESSAGE_INDISPONIBLE = "Service temporairement indisponible. Réessayez dans un instant.";
export const RETRY_AFTER_SECONDES = 5;

// Erreurs d'analyse du corps de requête (body-parser / http-errors). Leur `message` est un texte
// technique en anglais (parfois un extrait du JSON reçu) : il n'est JAMAIS renvoyé au client.
const ERREURS_CORPS = {
  "entity.parse.failed": [400, "Corps de requête invalide : JSON attendu."],
  "entity.too.large": [413, "Requête trop volumineuse."],
  "encoding.unsupported": [415, "Encodage de la requête non pris en charge."],
  "charset.unsupported": [415, "Jeu de caractères de la requête non pris en charge."],
  "request.size.invalid": [400, "Requête invalide."],
  "request.aborted": [400, "Requête interrompue."],
  "stream.encoding.set": [400, "Requête invalide."],
  "parameters.too.many": [413, "Requête trop volumineuse."],
};

// Codes Postgres (SQLSTATE) qui signifient « base momentanément inutilisable ».
const SQLSTATE_INDISPONIBLE = new Set(["53300", "53000", "53100", "53200", "53400", "57P01", "57P02", "57P03", "08000", "08001", "08003", "08004", "08006", "08007"]);
// Conflits d'accès simultané : réessayer fonctionne.
const SQLSTATE_CONFLIT = new Set(["40001", "40P01"]);

// Codes Prisma (client) d'indisponibilité : injoignable, délai, pool, connexions, transaction expirée.
const CODES_PRISMA_INDISPONIBLE = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2028", "P2037"]);
const KINDS_INDISPONIBLE = new Set(["DatabaseNotReachable", "TooManyConnections", "ConnectionClosed", "SocketTimeout", "TlsConnectionError", "DatabaseDoesNotExist", "DatabaseAccessDenied"]);

// Erreurs réseau Node (`err.code`) et messages du pilote `pg` (erreurs non Prisma).
const CODES_RESEAU = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"]);
const MESSAGE_PILOTE = /Connection terminated|connection timeout|timeout exceeded when trying to connect|Query read timeout|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|Can't reach database|too many clients|server closed the connection/i;

function causeAdaptateur(err) {
  return err?.meta?.driverAdapterError?.cause ?? null;
}

/**
 * @returns {{ status: number, message: string, categorie: string, retryAfter?: number, details?: object }}
 */
export function classifierErreur(err) {
  if (err instanceof HttpError) {
    return { status: err.status ?? 500, message: err.message, categorie: "metier", ...(err.details ? { details: err.details } : {}) };
  }

  if (err && typeof err.type === "string" && ERREURS_CORPS[err.type]) {
    const [status, message] = ERREURS_CORPS[err.type];
    return { status, message, categorie: "corps_requete" };
  }

  const code = err?.code;
  const cause = causeAdaptateur(err);
  const originalCode = cause?.originalCode;
  const kind = cause?.kind;

  if (code === "P2002" || kind === "UniqueConstraintViolation") {
    return { status: 409, message: "Un enregistrement identique existe déjà.", categorie: "conflit_unicite" };
  }
  if (code === "P2003" || kind === "ForeignKeyConstraintViolation") {
    return { status: 409, message: "Opération impossible : des données liées existent ou sont invalides.", categorie: "cle_etrangere" };
  }
  if (code === "P2025") {
    return { status: 404, message: "Ressource introuvable.", categorie: "introuvable" };
  }
  if (code === "P2034" || kind === "TransactionWriteConflict" || SQLSTATE_CONFLIT.has(originalCode)) {
    return { status: 409, message: "Conflit d'accès simultané : réessayez.", categorie: "conflit_acces" };
  }
  const estCodePrisma = typeof code === "string" && /^Pd{4}$/.test(code);
  const message = typeof err?.message === "string" ? err.message : "";
  if (
    CODES_PRISMA_INDISPONIBLE.has(code) ||
    KINDS_INDISPONIBLE.has(kind) ||
    SQLSTATE_INDISPONIBLE.has(originalCode) ||
    CODES_RESEAU.has(code) ||
    (!estCodePrisma && MESSAGE_PILOTE.test(message))
  ) {
    return { status: 503, message: MESSAGE_INDISPONIBLE, categorie: "base_indisponible", retryAfter: RETRY_AFTER_SECONDES };
  }

  return { status: 500, message: MESSAGE_INTERNE, categorie: "interne" };
}
