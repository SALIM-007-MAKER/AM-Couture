import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fournisseursApi } from "./api.js";

export function useFournisseursQuery(params) {
  return useQuery({ queryKey: ["fournisseurs", "list", params], queryFn: () => fournisseursApi.list(params), placeholderData: (prev) => prev });
}

export function useFournisseurQuery(id) {
  return useQuery({ queryKey: ["fournisseurs", "detail", id], queryFn: () => fournisseursApi.get(id), enabled: Boolean(id) });
}

export function useCreateFournisseurMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => fournisseursApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fournisseurs", "list"] });
    },
  });
}

// Chaque écriture renvoie le fournisseur complet : on le place directement dans le cache du détail.
function useEcriture(id, fn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (fournisseur) => {
      queryClient.setQueryData(["fournisseurs", "detail", id], fournisseur);
      queryClient.invalidateQueries({ queryKey: ["fournisseurs", "list"] });
    },
  });
}

export const useUpdateFournisseurMutation = (id) => useEcriture(id, (data) => fournisseursApi.update(id, data));
export const useArchiveFournisseurMutation = (id) => useEcriture(id, () => fournisseursApi.archive(id));
export const useRestoreFournisseurMutation = (id) => useEcriture(id, () => fournisseursApi.restore(id));
