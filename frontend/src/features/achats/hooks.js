import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { achatsApi } from "./api.js";

export const useAchatsQuery = (params) => useQuery({ queryKey: ["achats", "list", params], queryFn: () => achatsApi.list(params), placeholderData: (prev) => prev });
export const useAchatQuery = (id) => useQuery({ queryKey: ["achats", "detail", id], queryFn: () => achatsApi.get(id), enabled: Boolean(id) });
export const useAchatOptionsQuery = () => useQuery({ queryKey: ["achats", "options"], queryFn: () => achatsApi.options() });

export function useCreateAchatMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, cle }) => achatsApi.create(data, cle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["achats"] });
    },
  });
}

// Chaque opération renvoie l'achat complet. Une réception ou un paiement change aussi le stock et les dépenses :
// on invalide ces listes pour qu'elles ne montrent jamais un état périmé.
function useOperation(id, fn, { stock = false, depenses = false } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (achat) => {
      queryClient.setQueryData(["achats", "detail", id], achat);
      queryClient.invalidateQueries({ queryKey: ["achats", "list"] });
      if (stock) queryClient.invalidateQueries({ queryKey: ["stock"] });
      if (depenses) queryClient.invalidateQueries({ queryKey: ["depenses"] });
    },
  });
}

export const useReceptionMutation = (id) => useOperation(id, ({ lignes, cle }) => achatsApi.receptionner(id, lignes, cle), { stock: true });
export const usePayerAchatMutation = (id) => useOperation(id, () => achatsApi.payer(id), { depenses: true });
export const useAnnulerAchatMutation = (id) => useOperation(id, (motif) => achatsApi.annuler(id, motif));
