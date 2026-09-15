import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { stockApi } from "./api.js";

export function useArticlesStockQuery(params) {
  return useQuery({
    queryKey: ["stock", "list", params],
    queryFn: () => stockApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useArticleStockQuery(id) {
  return useQuery({
    queryKey: ["stock", "detail", id],
    queryFn: () => stockApi.get(id),
    enabled: Boolean(id),
  });
}

export function useAlertesStockQuery() {
  return useQuery({ queryKey: ["stock", "alertes"], queryFn: () => stockApi.alertes() });
}

export function useCreateArticleStockMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => stockApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock", "list"] });
      queryClient.invalidateQueries({ queryKey: ["stock", "alertes"] });
    },
  });
}

export function useUpdateArticleStockMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => stockApi.update(id, data),
    onSuccess: (article) => {
      queryClient.setQueryData(["stock", "detail", id], article);
      queryClient.invalidateQueries({ queryKey: ["stock", "list"] });
      queryClient.invalidateQueries({ queryKey: ["stock", "alertes"] });
    },
  });
}

export function useArchiveArticleStockMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => stockApi.archive(id),
    onSuccess: (article) => {
      queryClient.setQueryData(["stock", "detail", id], article);
      queryClient.invalidateQueries({ queryKey: ["stock", "list"] });
      queryClient.invalidateQueries({ queryKey: ["stock", "alertes"] });
    },
  });
}

export function useRestoreArticleStockMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => stockApi.restore(id),
    onSuccess: (article) => {
      queryClient.setQueryData(["stock", "detail", id], article);
      queryClient.invalidateQueries({ queryKey: ["stock", "list"] });
      queryClient.invalidateQueries({ queryKey: ["stock", "alertes"] });
    },
  });
}

export function useMouvementsQuery(articleId, params) {
  return useQuery({
    queryKey: ["stock", "mouvements", articleId, params],
    queryFn: () => stockApi.mouvements.list(articleId, params),
    enabled: Boolean(articleId),
    placeholderData: (prev) => prev,
  });
}

export function useCreateMouvementMutation(articleId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => stockApi.mouvements.create(articleId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock", "mouvements", articleId] });
      queryClient.invalidateQueries({ queryKey: ["stock", "detail", articleId] });
      queryClient.invalidateQueries({ queryKey: ["stock", "list"] });
      queryClient.invalidateQueries({ queryKey: ["stock", "alertes"] });
    },
  });
}
