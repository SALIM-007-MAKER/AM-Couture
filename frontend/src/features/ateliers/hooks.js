import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ateliersApi } from "./api.js";

const QUERY_KEY = ["ateliers"];

export function useAteliersQuery() {
  return useQuery({ queryKey: QUERY_KEY, queryFn: () => ateliersApi.list() });
}

export function useCreateAtelierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => ateliersApi.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
