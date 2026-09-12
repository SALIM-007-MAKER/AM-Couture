import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientesApi } from "./api.js";

export function useClientesQuery(params) {
  return useQuery({
    queryKey: ["clientes", "list", params],
    queryFn: () => clientesApi.list(params),
    // Garde la page précédente affichée pendant le chargement de la
    // suivante — évite un flash "vide" à chaque changement de page/filtre.
    placeholderData: (prev) => prev,
  });
}

export function useClienteQuery(id) {
  return useQuery({
    queryKey: ["clientes", "detail", id],
    queryFn: () => clientesApi.get(id),
    enabled: Boolean(id),
  });
}

export function useCreateClienteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => clientesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes", "list"] });
    },
  });
}

export function useUpdateClienteMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => clientesApi.update(id, data),
    onSuccess: (cliente) => {
      queryClient.setQueryData(["clientes", "detail", id], cliente);
      queryClient.invalidateQueries({ queryKey: ["clientes", "list"] });
    },
  });
}

export function useArchiveClienteMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clientesApi.archive(id),
    onSuccess: (cliente) => {
      queryClient.setQueryData(["clientes", "detail", id], cliente);
      queryClient.invalidateQueries({ queryKey: ["clientes", "list"] });
    },
  });
}

export function useRestoreClienteMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clientesApi.restore(id),
    onSuccess: (cliente) => {
      queryClient.setQueryData(["clientes", "detail", id], cliente);
      queryClient.invalidateQueries({ queryKey: ["clientes", "list"] });
    },
  });
}

// Totaux agrégés (toutes les commandes du client, pas seulement la page
// affichée) — voir ClienteDetailPage.jsx, bloc "Total commandes/payé/restant".
export function useClienteTotauxQuery(clienteId) {
  return useQuery({
    queryKey: ["clientes", clienteId, "totaux"],
    queryFn: () => clientesApi.totaux(clienteId),
    enabled: Boolean(clienteId),
  });
}

export function useMesuresQuery(clienteId, params) {
  return useQuery({
    queryKey: ["clientes", clienteId, "mesures", "list", params],
    queryFn: () => clientesApi.mesures.list(clienteId, params),
    enabled: Boolean(clienteId),
    placeholderData: (prev) => prev,
  });
}

// Utilisée par la fiche Commande (section "Mesures") : la dernière prise en
// date de la cliente, sans re-parcourir tout l'historique. Un 404 signifie
// "aucune mesure enregistrée" — état normal, pas une erreur (voir usage,
// même logique que "notConfigured" dans ParametresPage.jsx).
export function useDerniereMesureQuery(clienteId) {
  return useQuery({
    queryKey: ["clientes", clienteId, "mesures", "derniere"],
    queryFn: () => clientesApi.mesures.derniere(clienteId),
    enabled: Boolean(clienteId),
    retry: false,
  });
}

export function useCreateMesureMutation(clienteId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => clientesApi.mesures.create(clienteId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes", clienteId, "mesures"] });
    },
  });
}
