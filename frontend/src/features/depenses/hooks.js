import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { depensesApi } from "./api.js";

export function useDepensesQuery(params) {
  return useQuery({
    queryKey: ["depenses", "list", params],
    queryFn: () => depensesApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useDepenseQuery(id) {
  return useQuery({
    queryKey: ["depenses", "detail", id],
    queryFn: () => depensesApi.get(id),
    enabled: Boolean(id),
  });
}

export function useDepensesStatsQuery(params) {
  return useQuery({
    queryKey: ["depenses", "stats", params],
    queryFn: () => depensesApi.stats(params),
    placeholderData: (prev) => prev,
  });
}

export function useCreateDepenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => depensesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["depenses", "list"] });
      queryClient.invalidateQueries({ queryKey: ["depenses", "stats"] });
    },
  });
}

export function useAnnulerDepenseMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (motif) => depensesApi.annuler(id, motif),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["depenses", "detail", id] });
      queryClient.invalidateQueries({ queryKey: ["depenses", "list"] });
      queryClient.invalidateQueries({ queryKey: ["depenses", "stats"] });
    },
  });
}
