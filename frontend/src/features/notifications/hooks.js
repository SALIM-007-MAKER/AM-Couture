import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "./api.js";

const LIST_KEY = ["notifications", "list"];
const COUNT_KEY = ["notifications", "nombreNonLues"];

export function useNotificationsQuery(params) {
  return useQuery({
    queryKey: [...LIST_KEY, params],
    queryFn: () => notificationsApi.list(params),
    placeholderData: (prev) => prev,
  });
}

// Pastille de l'en-tête (voir AppLayout.jsx) — repolling léger (60s) : pas de
// websocket dans ce projet, un compteur qui se rafraîchit à la minute reste
// largement suffisant pour un usage mono-atelier (pas un chat en temps réel).
export function useNombreNonLuesQuery() {
  return useQuery({
    queryKey: COUNT_KEY,
    queryFn: () => notificationsApi.nombreNonLues(),
    refetchInterval: 60_000,
  });
}

function invalidateNotifications(queryClient) {
  queryClient.invalidateQueries({ queryKey: LIST_KEY });
  queryClient.invalidateQueries({ queryKey: COUNT_KEY });
}

export function useMarquerLuMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, lu }) => notificationsApi.marquerLu(id, lu),
    onSuccess: () => invalidateNotifications(queryClient),
  });
}

export function useMarquerLuMasseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids) => notificationsApi.marquerLuMasse(ids),
    onSuccess: () => invalidateNotifications(queryClient),
  });
}

export function useSupprimerMasseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids) => notificationsApi.supprimerMasse(ids),
    onSuccess: () => invalidateNotifications(queryClient),
  });
}
