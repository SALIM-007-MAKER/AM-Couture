import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient.js";

const ME_KEY = ["auth", "me"];

// Un SUPERADMIN n'a pas d'atelierId — "/" (Dashboard) lui est interdit côté
// backend (requireAtelier) — son "accueil" est la gestion des ateliers.
// Utilisé partout où on redirige un utilisateur déjà connecté (voir
// PublicOnlyRoute.jsx) — une seule source de vérité pour cette règle.
export function homePathForUser(user) {
  return user?.role === "SUPERADMIN" ? "/vue-ensemble" : "/";
}

/**
 * Source de vérité de l'authentification : le cookie de session est
 * HttpOnly (illisible en JS, volontairement — voir module Auth backend), la
 * seule façon de savoir "suis-je connecté ?" est d'interroger le serveur.
 * `retry: false` : un 401 est un état normal (déconnecté), pas une panne
 * réseau à réessayer — réessayer ralentirait juste la redirection vers /login.
 */
export function useMeQuery() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => api.get("/auth/me"),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ identifiant, password }) => api.post("/auth/login", { identifiant, password }),
    onSuccess: (user) => {
      queryClient.setQueryData(ME_KEY, user);
    },
  });
}

// Branding par identifiant (Phase 8) : utilisée par LoginPage pour afficher
// le logo/nom de l'atelier dès que l'identifiant tapé est reconnu, AVANT
// connexion — voir GET /api/auth/atelier-pour-identifiant (auth.routes.js).
// `enabled` : n'interroge le serveur qu'à partir de 3 caractères (aucun
// identifiant réel ne fait moins, voir atelierAdmin.schema.js) — appelant
// responsable de debouncer la frappe (voir LoginPage.jsx).
export function useAtelierPourIdentifiantQuery(identifiant) {
  return useQuery({
    queryKey: ["auth", "atelier-pour-identifiant", identifiant],
    queryFn: () => api.get(`/auth/atelier-pour-identifiant?identifiant=${encodeURIComponent(identifiant)}`),
    enabled: identifiant.trim().length >= 3,
    retry: false,
    staleTime: 30_000,
  });
}

// Inscription en libre-service (Phase 8) : un propriétaire d'atelier crée
// lui-même son atelier + son compte ADMIN, sans SUPERADMIN — voir
// POST /api/auth/inscription-atelier (auth.routes.js). Le backend pose
// directement le cookie de session (même comportement que /login) : pas
// besoin d'un second aller-retour de connexion après l'inscription.
export function useInscriptionAtelierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post("/auth/inscription-atelier", data),
    onSuccess: (user) => {
      queryClient.setQueryData(ME_KEY, user);
    },
  });
}

// Réponse backend TOUJOURS générique (voir motDePasseOublieSchema,
// auth.routes.js) : jamais de setQueryData ici, cette route ne change rien
// à l'état "connecté" du visiteur qui l'appelle.
export function useMotDePasseOublieMutation() {
  return useMutation({
    mutationFn: ({ identifiant }) => api.post("/auth/mot-de-passe-oublie", { identifiant }),
  });
}

export function useReinitialiserMotDePasseTokenMutation() {
  return useMutation({
    mutationFn: ({ token, nouveauMotDePasse }) =>
      api.post("/auth/reinitialiser-mot-de-passe-token", { token, nouveauMotDePasse }),
  });
}

// GET (pas POST) côté backend, mais une action à usage unique déclenchée par
// un clic explicite (voir VerifierEmailPage.jsx) — useMutation reste le bon
// outil ici (pas de cache à tenir à jour, juste une action ponctuelle),
// malgré le verbe HTTP.
export function useVerifierEmailMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ token }) => api.get(`/auth/verifier-email?token=${encodeURIComponent(token)}`),
    onSuccess: () => {
      // Rafraîchit `emailVerifieLe` si la personne est déjà connectée dans
      // cet onglet (cas fréquent : elle vient de s'inscrire puis clique le
      // lien reçu par email dans un nouvel onglet du même navigateur).
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

// Contrairement à l'email envoyé automatiquement à l'inscription (best
// effort, jamais remonté à l'utilisateur), une demande explicite de renvoi
// doit informer clairement d'un échec (502 si Resend n'est pas configuré,
// par exemple) — voir POST /renvoyer-verification-email, auth.routes.js.
export function useRenvoyerVerificationEmailMutation() {
  return useMutation({
    mutationFn: () => api.post("/auth/renvoyer-verification-email", {}),
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSettled: () => {
      // onSettled (pas seulement onSuccess) : même si l'appel réseau échoue,
      // on efface l'état "connecté" côté client — l'utilisateur a demandé à
      // se déconnecter, on ne le laisse pas bloqué sur un écran protégé.
      queryClient.setQueryData(ME_KEY, null);
    },
  });
}
