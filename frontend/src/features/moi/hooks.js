import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { moiApi } from "./api.js";

export function useMonProfilQuery() {
  return useQuery({ queryKey: ["moi", "profil"], queryFn: moiApi.profil });
}

export function useMesMesuresQuery() {
  return useQuery({ queryKey: ["moi", "mesures"], queryFn: moiApi.mesures });
}

export function useMesCommandesQuery() {
  return useQuery({ queryKey: ["moi", "commandes", "list"], queryFn: moiApi.commandes.list });
}

export function useMaCommandeQuery(id) {
  return useQuery({
    queryKey: ["moi", "commandes", "detail", id],
    queryFn: () => moiApi.commandes.get(id),
    enabled: Boolean(id),
  });
}

export function useMesPaiementsQuery() {
  return useQuery({ queryKey: ["moi", "paiements"], queryFn: moiApi.paiements });
}

export function useMesNotificationsQuery() {
  return useQuery({ queryKey: ["moi", "notifications"], queryFn: moiApi.notifications });
}

export function useMesDemandesQuery() {
  return useQuery({ queryKey: ["moi", "demandes"], queryFn: moiApi.demandes.list });
}

export function useMesRecusQuery() {
  return useQuery({ queryKey: ["moi", "recus"], queryFn: moiApi.recus });
}

export function useCreerDemandeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => moiApi.demandes.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["moi", "demandes"] });
    },
  });
}
