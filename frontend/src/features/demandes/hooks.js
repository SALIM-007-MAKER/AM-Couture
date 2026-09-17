import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { demandesApi } from "./api.js";

export function useDemandesQuery(params) {
  return useQuery({
    queryKey: ["demandes", "list", params],
    queryFn: () => demandesApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useDemandeQuery(id) {
  return useQuery({
    queryKey: ["demandes", "detail", id],
    queryFn: () => demandesApi.get(id),
    enabled: Boolean(id),
  });
}

export function useAccepterDemandeMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commandeId) => demandesApi.accepter(id, commandeId),
    onSuccess: (demande) => {
      queryClient.setQueryData(["demandes", "detail", id], demande);
      queryClient.invalidateQueries({ queryKey: ["demandes", "list"] });
    },
  });
}

export function useRefuserDemandeMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (motifRefus) => demandesApi.refuser(id, motifRefus),
    onSuccess: (demande) => {
      queryClient.setQueryData(["demandes", "detail", id], demande);
      queryClient.invalidateQueries({ queryKey: ["demandes", "list"] });
    },
  });
}
