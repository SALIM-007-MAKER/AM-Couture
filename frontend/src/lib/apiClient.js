import { queryClient } from "./queryClient.js";
import { ApiError } from "./apiError.js";

// Ré-exportée pour compatibilité : tout le code existant importe `ApiError`
// depuis ce fichier. La classe elle-même vit dans apiError.js pour éviter un
// cycle d'import avec queryClient.js (voir ce fichier).
export { ApiError };

/**
 * Même domaine en dev (proxy Vite, voir vite.config.js) et en prod (voir
 * backend/src/app.js) : aucun `credentials`/CORS spécifique à gérer, le
 * cookie de session HttpOnly part automatiquement avec chaque requête
 * same-origin.
 */
async function request(path, { method = "GET", body, signal } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (res.status === 204) return null;

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // Ne devrait pas arriver sur /api/* (toujours du JSON, voir app.js) —
    // on laisse `payload` à null plutôt que de masquer un statut non-ok.
  }

  if (!res.ok) {
    // Un 401 signifie que la session n'est plus valide (jamais vue, ou
    // expirée pendant l'utilisation) : on invalide immédiatement le cache de
    // "qui suis-je" pour que ProtectedRoute redirige vers /login au prochain
    // rendu, sans attendre un nouveau fetch. Inoffensif pour un 401 attendu
    // (ex : mauvais mot de passe sur /auth/login, déjà "non authentifié").
    if (res.status === 401) {
      queryClient.setQueryData(["auth", "me"], null);
    }
    throw new ApiError(res.status, payload?.error ?? "Une erreur est survenue.", payload?.details);
  }

  return payload;
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: "GET" }),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  put: (path, body, opts) => request(path, { ...opts, method: "PUT", body }),
  patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
};
