import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { plansAdminApi } from "./api.js";

const KEY = ["plans-abonnement", "tous"];

export function usePlansTousQuery() {
  return useQuery({ queryKey: KEY, queryFn: () => plansAdminApi.tous() });
}

function invalidate(queryClient) {
  queryClient.invalidateQueries({ queryKey: ["plans-abonnement"] });
}

export function useCreerPlanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => plansAdminApi.creer(data),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useModifierPlanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => plansAdminApi.modifier(id, data),
    onSuccess: () => invalidate(queryClient),
  });
}
