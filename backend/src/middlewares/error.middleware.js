/**
 * Middleware d'erreur centralisé.
 * Règle de sécurité : ne jamais logger ni renvoyer le contenu brut d'une
 * erreur (peut contenir des requêtes SQL, des tokens, des données de
 * clientes). On logue uniquement un message technique court côté serveur,
 * et on renvoie un message générique au client sauf si l'erreur est
 * explicitement marquée "publique" (validation Zod, 404 métier, etc.).
 */
export function errorMiddleware(err, req, res, next) {
  const status = err.status ?? 500;
  const isPublic = Boolean(err.expose);

  // Log serveur : jamais err.stack complet en prod, jamais req.body brut.
  console.error(`[${req.method} ${req.originalUrl}] ${status} — ${err.message}`);

  res.status(status).json({
    error: isPublic ? err.message : "Une erreur est survenue.",
    ...(isPublic && err.details ? { details: err.details } : {}),
  });
}

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.expose = true;
    this.details = details;
  }
}
