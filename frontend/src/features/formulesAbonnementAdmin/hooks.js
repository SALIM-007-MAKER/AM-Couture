import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formulesAdminApi } from "./api.js";

const KEY = ["formules-abonnement", "toutes"];

export function useFormulesToutesQuery() {
  return useQuery({ queryKey: KEY, queryFn: () => formulesAdminApi.toutes() });
}

export function useCreerFormuleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => formulesAdminApi.creer(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useModifierFormuleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => formulesAdminApi.modifier(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
