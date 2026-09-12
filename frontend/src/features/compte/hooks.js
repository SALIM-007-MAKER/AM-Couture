import { useMutation, useQueryClient } from "@tanstack/react-query";
import { compteApi } from "./api.js";

// Même clé que useMeQuery (hooks/useAuth.js) — une préférence modifiée ici
// doit se refléter partout où l'utilisateur courant est lu (ex: en-tête).
const ME_KEY = ["auth", "me"];

export function useUpdatePreferencesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => compteApi.updatePreferences(data),
    onSuccess: (user) => queryClient.setQueryData(ME_KEY, user),
  });
}

// Pas d'invalidation particulière : un changement de mot de passe ne modifie
// aucune donnée affichée ailleurs (la session en cours reste valide).
export function useChangerMotDePasseMutation() {
  return useMutation({ mutationFn: (data) => compteApi.changerMotDePasse(data) });
}
