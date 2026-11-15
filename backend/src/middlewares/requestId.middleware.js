import crypto from "node:crypto";

/**
 * Attribue un identifiant unique à chaque requête : `req.id`, en-tête de réponse `X-Request-Id`,
 * champ des journaux d'erreur et corps des réponses 5xx. Un utilisateur qui signale « une erreur
 * est survenue » peut ainsi fournir une référence qui retrouve exactement la ligne de journal.
 *
 * L'identifiant est TOUJOURS généré côté serveur : un en-tête entrant n'est jamais repris (il
 * permettrait d'injecter du texte arbitraire dans les journaux).
 */
export function requestId(req, res, next) {
  req.id = crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}
