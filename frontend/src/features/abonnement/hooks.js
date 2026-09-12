import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formulesApi, abonnementsApi, transactionsApi } from "./api.js";
import { ApiError } from "../../lib/apiClient.js";

export function useFormulesQuery() {
  return useQuery({ queryKey: ["formules-abonnement"], queryFn: () => formulesApi.list() });
}

// Un 404 signifie "aucun abonnement encore souscrit" — état normal (première
// utilisation), pas une erreur (même logique que la fiche client sans mesure).
export function useAbonnementActuelQuery() {
  return useQuery({
    queryKey: ["abonnements", "actuel"],
    queryFn: () => abonnementsApi.actuel(),
    retry: false,
  });
}

export function useAbonnementsQuery(params) {
  return useQuery({
    queryKey: ["abonnements", "list", params],
    queryFn: () => abonnementsApi.list(params),
    placeholderData: (prev) => prev,
  });
}

function invalidateAbonnements(queryClient) {
  queryClient.invalidateQueries({ queryKey: ["abonnements"] });
}

export function useCreerAbonnementMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => abonnementsApi.creer(data),
    onSuccess: () => invalidateAbonnements(queryClient),
  });
}

export function useConfirmerManuelMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => transactionsApi.confirmerManuel(id),
    onSuccess: () => invalidateAbonnements(queryClient),
  });
}

export function useRejeterManuelMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => transactionsApi.rejeterManuel(id),
    onSuccess: () => invalidateAbonnements(queryClient),
  });
}

export function isNotFound(error) {
  return error instanceof ApiError && error.status === 404;
}
