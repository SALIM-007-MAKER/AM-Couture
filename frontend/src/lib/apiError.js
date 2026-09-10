/**
 * Extrait dans son propre fichier (plutôt que dans apiClient.js) pour éviter
 * une dépendance circulaire : queryClient.js en a besoin pour sa politique
 * de retry, et apiClient.js importe déjà queryClient.js (intercepteur 401).
 */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}
