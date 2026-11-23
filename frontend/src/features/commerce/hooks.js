import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commerceApi, paiementsAdminApi } from "./api.js";

const PAIEMENTS_KEY = ["commerce", "paiements"];

export function usePaiementsAdminQuery(params) {
  return useQuery({
    queryKey: [...PAIEMENTS_KEY, params],
    queryFn: () => paiementsAdminApi.liste(params),
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

// Cloche du SUPERADMIN : paiements déclarés en attente de décision, rafraîchis à la minute (pas de websocket dans ce projet).
export function usePaiementsAValiderQuery() {
  return useQuery({
    queryKey: [...PAIEMENTS_KEY, "a-valider"],
    queryFn: () => paiementsAdminApi.aValider(),
    refetchInterval: 60_000,
  });
}

/** Une décision change le paiement, le tableau de bord commercial et la fiche d'abonnement de l'atelier. */
function useDecision(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce"] });
      queryClient.invalidateQueries({ queryKey: ["ateliers"] });
    },
  });
}

export const useConfirmerPaiementMutation = () => useDecision((id) => paiementsAdminApi.confirmer(id));
export const useRejeterPaiementMutation = () => useDecision(({ id, motif }) => paiementsAdminApi.rejeter(id, motif));
export const useRembourserPaiementMutation = () => useDecision(({ id, motif }) => paiementsAdminApi.rembourser(id, motif));

export const useSyntheseCommerceQuery = () => useQuery({ queryKey: ["commerce", "synthese"], queryFn: () => commerceApi.synthese() });
export const useRevenusQuery = (mois) => useQuery({ queryKey: ["commerce", "revenus", mois], queryFn: () => commerceApi.revenus(mois), placeholderData: (prev) => prev });
export const useRenouvellementsQuery = (jours) =>
  useQuery({ queryKey: ["commerce", "renouvellements", jours], queryFn: () => commerceApi.renouvellements(jours), placeholderData: (prev) => prev });
export const useParametresAbonnementQuery = () => useQuery({ queryKey: ["commerce", "parametres"], queryFn: () => commerceApi.parametres() });

export function useEnregistrerParametresMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => commerceApi.enregistrerParametres(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce"] });
    },
  });
}
