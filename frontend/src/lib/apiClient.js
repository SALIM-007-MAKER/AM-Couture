import { queryClient } from "./queryClient.js";
import { ApiError, erreurDepuisReponse } from "./apiError.js";
import { useAbonnementStore } from "../stores/abonnementStore.js";
import { signalerReseauIndisponible } from "./connexion.js";
import { effacerInstantane } from "./instantaneStockage.js";
import { effacerFile } from "./fileStockage.js";

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
// Au-delà, la requête est abandonnée : sans délai, une connexion qui ne répond plus laissait
// l'écran en « chargement » indéfiniment.
export const DELAI_REQUETE_MS = 40_000;

async function request(path, { method = "GET", body, signal, headers } = {}) {
  const delai = AbortSignal.timeout(DELAI_REQUETE_MS);
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined || headers ? { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([signal, delai]) : delai,
    });
  } catch (err) {
    // Annulation voulue par l'appelant (changement de page, TanStack Query) : ce n'est pas une panne.
    if (signal?.aborted) throw err;
    // Aucune réponse : coupure réseau / hors ligne, ou délai dépassé. L'application bascule en consultation hors ligne
    // (requêtes en pause avec leurs données, jamais en erreur) et sonde le retour du serveur (voir connexion.js).
    signalerReseauIndisponible();
    throw new ApiError(0, "Le serveur n'a pas répondu.", undefined, { kind: delai.aborted ? "timeout" : "network" });
  }

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
      // Session terminée : plus aucune donnée personnelle ne doit rester sur l'appareil.
      effacerInstantane();
      effacerFile();
    }
    // 402 = essai gratuit terminé sans abonnement actif (voir
    // requireAbonnementActif, auth.middleware.js) — signale l'état via
    // abonnementStore plutôt qu'une invalidation de cache : PaywallBanner
    // (components/PaywallBanner.jsx) s'en sert pour rediriger vers
    // /abonnement depuis n'importe quelle page, sans qu'aucun appelant ici
    // n'ait besoin de connaître ce comportement.
    // Exception : un 402 « lecture seule » (details.lectureSeule) refuse UNE écriture, alors que la consultation reste
    // possible. Pas de redirection : le message du serveur s'affiche là où l'utilisateur a tenté d'écrire.
    if (res.status === 402 && !payload?.details?.lectureSeule) {
      useAbonnementStore.getState().setBloque(true);
    }
    throw erreurDepuisReponse(res.status, payload, res.headers);
  }

  // Une requête réussie prouve que l'atelier n'est plus bloqué (ex : juste
  // après une souscription) — se corrige tout seul, sans rechargement de page.
  useAbonnementStore.getState().setBloque(false);

  return payload;
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: "GET" }),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  put: (path, body, opts) => request(path, { ...opts, method: "PUT", body }),
  patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
  // Premier usage : suppression DÉFINITIVE d'un atelier vide par le SUPERADMIN
  // (voir features/ateliers/api.js) — tout le reste de l'app évite les
  // suppressions dures au profit d'une annulation/archivage logique.
  delete: (path, opts) => request(path, { ...opts, method: "DELETE" }),
};
