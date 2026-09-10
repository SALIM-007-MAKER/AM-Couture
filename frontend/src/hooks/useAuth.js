import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient.js";

const ME_KEY = ["auth", "me"];

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
