/**
 * Extrait dans son propre fichier (plutôt que dans apiClient.js) pour éviter
 * une dépendance circulaire : queryClient.js en a besoin pour sa politique
 * de retry, et apiClient.js importe déjà queryClient.js (intercepteur 401).
 *
 * `kind` classe la cause pour l'affichage (voir errorMessage.js) :
 *   "network"     le serveur n'a pas répondu (coupure, hors ligne) — status 0
 *   "timeout"     aucune réponse dans le délai — status 0
 *   "unavailable" 503 : service ou base momentanément indisponible
 *   "tooLarge"    413 : requête trop volumineuse
 *   "server"      autre 5xx
 *   "client"      4xx : message métier du serveur, affiché tel quel
 * `requestId` : référence de la ligne de journal serveur (en-tête X-Request-Id).
 */
export class ApiError extends Error {
  constructor(status, message, details, extra = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.kind = extra.kind ?? kindFromStatus(status);
    this.requestId = extra.requestId ?? null;
    this.retryAfter = extra.retryAfter ?? null;
  }
}

export function kindFromStatus(status) {
  if (status === 503) return "unavailable";
  if (status === 413) return "tooLarge";
  if (status >= 500) return "server";
  return "client";
}

/** Construit l'ApiError d'une réponse non-ok. `payload` peut être null (corps non JSON, ex. page d'erreur de la plateforme). */
export function erreurDepuisReponse(status, payload, headers) {
  const lire = (nom) => (typeof headers?.get === "function" ? headers.get(nom) : null);
  const retry = Number(lire("Retry-After"));
  return new ApiError(status, payload?.error ?? "Une erreur est survenue.", payload?.details, {
    requestId: payload?.requestId ?? lire("X-Request-Id") ?? null,
    retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null,
  });
}
