import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { modelesApi } from "./api.js";

export function useModelesQuery(params) {
  return useQuery({
    queryKey: ["modeles", "list", params],
    queryFn: () => modelesApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useModeleQuery(id) {
  return useQuery({
    queryKey: ["modeles", "detail", id],
    queryFn: () => modelesApi.get(id),
    enabled: Boolean(id),
  });
}

export function useCreateModeleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => modelesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modeles", "list"] });
    },
  });
}

export function useUpdateModeleMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => modelesApi.update(id, data),
    onSuccess: (modele) => {
      queryClient.setQueryData(["modeles", "detail", id], modele);
      queryClient.invalidateQueries({ queryKey: ["modeles", "list"] });
    },
  });
}

export function useArchiveModeleMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => modelesApi.archive(id),
    onSuccess: (modele) => {
      queryClient.setQueryData(["modeles", "detail", id], modele);
      queryClient.invalidateQueries({ queryKey: ["modeles", "list"] });
    },
  });
}

export function useRestoreModeleMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => modelesApi.restore(id),
    onSuccess: (modele) => {
      queryClient.setQueryData(["modeles", "detail", id], modele);
      queryClient.invalidateQueries({ queryKey: ["modeles", "list"] });
    },
  });
}
