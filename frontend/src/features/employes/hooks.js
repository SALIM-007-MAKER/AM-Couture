import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { employesApi } from "./api.js";

const KEY = ["employes"];

export const useCatalogueQuery = () => useQuery({ queryKey: [...KEY, "catalogue"], queryFn: () => employesApi.catalogue(), staleTime: 10 * 60_000 });

export function useEmployesQuery(params) {
  return useQuery({ queryKey: [...KEY, "liste", params], queryFn: () => employesApi.list(params), placeholderData: (prev) => prev });
}

export const useEmployeQuery = (id) => useQuery({ queryKey: [...KEY, "detail", id], queryFn: () => employesApi.get(id), enabled: Boolean(id) });

/** Toute opération relit la liste, le détail et « qui suis-je » (les permissions d'un employé changent son accès). */
function useOperation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    // Pas de « return » : une promesse renvoyée serait attendue avant les rappels de mutate() (voir features/abonnement/hooks.js).
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}

export const useCreerEmployeMutation = () => useOperation(({ corps, cle }) => employesApi.create(corps, cle));
export const useModifierEmployeMutation = () => useOperation(({ id, corps }) => employesApi.update(id, corps));
export const useDesactiverEmployeMutation = () => useOperation((id) => employesApi.desactiver(id));
export const useReactiverEmployeMutation = () => useOperation((id) => employesApi.reactiver(id));
export const useMotDePasseEmployeMutation = () => useOperation(({ id, corps }) => employesApi.motDePasse(id, corps));
