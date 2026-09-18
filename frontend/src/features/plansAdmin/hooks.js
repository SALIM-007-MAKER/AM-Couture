import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { plansAdminApi, contactApi } from "./api.js";

const KEY = ["plans-abonnement", "tous"];
const CONTACT_KEY = ["plateforme", "contact"];

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

export function useContactQuery() {
  return useQuery({ queryKey: CONTACT_KEY, queryFn: () => contactApi.get() });
}

export function useEnregistrerContactMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (whatsapp) => contactApi.save(whatsapp),
    onSuccess: (data) => {
      queryClient.setQueryData(CONTACT_KEY, data);
      // Le PDG lit ce contact dans /abonnements/etat.
      queryClient.invalidateQueries({ queryKey: ["abonnements"] });
    },
  });
}
