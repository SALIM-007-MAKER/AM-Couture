import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { recusApi } from "./api.js";

// Une seule requête pour TOUS les reçus de la commande (récapitulatifs et
// liés à un paiement précis confondus) — le composant Paiements retrouve le
// reçu de chaque ligne par `recus.find(r => r.paiementId === paiement.id)`
// plutôt que de refaire une requête par paiement (évite les N+1).
export function useRecusQuery(commandeId) {
  return useQuery({
    queryKey: ["commandes", commandeId, "recus", "list"],
    queryFn: () => recusApi.listForCommande(commandeId, { page: 1, pageSize: 50 }),
    enabled: Boolean(commandeId),
  });
}

export function useRecusGlobalQuery(params) {
  return useQuery({
    queryKey: ["recus", "list", params],
    queryFn: () => recusApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useCreateRecapitulatifMutation(commandeId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => recusApi.createRecapitulatif(commandeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commandes", commandeId, "recus"] });
    },
  });
}

export function useCreateRecuForPaiementMutation(commandeId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paiementId) => recusApi.createForPaiement(commandeId, paiementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commandes", commandeId, "recus"] });
    },
  });
}
