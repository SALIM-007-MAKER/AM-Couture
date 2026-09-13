import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parametresApi } from "./api.js";

const QUERY_KEY = ["parametres"];

export function useParametresQuery() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => parametresApi.get(),
    // Un 404 (pas encore configuré) est un état normal, pas une erreur
    // transitoire à retenter — voir la politique globale (queryClient.js)
    // qui ne retente déjà aucune 4xx.
    retry: false,
  });
}

export function usePutParametresMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => parametresApi.put(data),
    onSuccess: (atelier) => {
      queryClient.setQueryData(QUERY_KEY, atelier);
    },
  });
}

export function usePatchParametresMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => parametresApi.patch(data),
    onSuccess: (atelier) => {
      queryClient.setQueryData(QUERY_KEY, atelier);
    },
  });
}
