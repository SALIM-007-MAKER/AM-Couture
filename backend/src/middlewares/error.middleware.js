import { HttpError } from "../lib/httpError.js";
import { classifierErreur, RETRY_AFTER_SECONDES } from "../lib/classifierErreur.js";

// Réexporté : toutes les routes importent HttpError depuis ce module.
export { HttpError };

const LONGUEUR_MESSAGE_LOG = 300;
const LIGNES_PILE_LOG = 8;

/** Chemin SANS query-string : un jeton passé en paramètre (?token=…) ne doit jamais atteindre les journaux. */
function cheminSansQuery(req) {
  return String(req.originalUrl ?? req.url ?? "").split("?")[0];
}

function ecrireJournal(niveau, ligne) {
  const texte = JSON.stringify(ligne);
  if (niveau === "error") console.error(texte);
  else console.warn(texte);
}

/**
 * Middleware d'erreur centralisé.
 *
 * - Le client ne reçoit JAMAIS le contenu brut d'une erreur (SQL, noms de contraintes, messages de
 *   bibliothèques) : seulement un message sûr en français choisi par `classifierErreur`.
 * - Toute réponse 5xx porte une référence (`requestId`, identique à l'en-tête X-Request-Id) qui
 *   retrouve la ligne de journal correspondante.
 * - Journal : une ligne JSON par erreur, sans corps de requête ni query-string ; la pile n'est
 *   conservée que pour les 5xx ; niveau `warn` pour les erreurs attendues (4xx).
 */
export function errorMiddleware(err, req, res, next) {
  const c = classifierErreur(err);
  const serveur = c.status >= 500;

  ecrireJournal(serveur ? "error" : "warn", {
    type: "erreur",
    date: new Date().toISOString(),
    requestId: req.id,
    methode: req.method,
    chemin: cheminSansQuery(req),
    status: c.status,
    categorie: c.categorie,
    ...(typeof err?.code === "string" ? { code: err.code } : {}),
    message: String(err?.message ?? err).replace(/\s+/g, " ").slice(0, LONGUEUR_MESSAGE_LOG),
    ...(req.user ? { userId: req.user.id, atelierId: req.user.atelierId, role: req.user.role } : {}),
    ...(serveur && err?.stack ? { pile: String(err.stack).split("\n").slice(0, LIGNES_PILE_LOG).join("\n") } : {}),
  });

  // Les en-têtes sont déjà partis : on ne peut plus écrire une réponse propre, Express ferme la connexion.
  if (res.headersSent) return next(err);

  if (c.retryAfter) res.setHeader("Retry-After", String(c.retryAfter ?? RETRY_AFTER_SECONDES));

  res.status(c.status).json({
    error: c.message,
    ...(c.details ? { details: c.details } : {}),
    ...(serveur && req.id ? { requestId: req.id } : {}),
  });
}
