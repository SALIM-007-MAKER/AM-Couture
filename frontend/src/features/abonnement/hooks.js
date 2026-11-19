import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { abonnementsApi, plansApi } from "./api.js";
import { useMeQuery } from "../../hooks/useAuth.js";

const ETAT_KEY = ["abonnements", "etat"];
const TRANSACTIONS_KEY = ["abonnements", "transactions"];

// Rafraîchi tout seul (30 s + au retour sur l'onglet) : une activation, un paiement confirmé ou une suspension faits
// par la plateforme apparaissent chez le PDG sans qu'il ait à recharger la page.
export function useEtatAbonnementQuery() {
  return useQuery({
    queryKey: ETAT_KEY,
    queryFn: () => abonnementsApi.etat(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

// Consommation des quotas (PDG seulement : un employé reçoit 403). Rafraîchie à chaque retour sur l'onglet et après chaque
// création réussie (les formulaires invalident la clé ["abonnements", "utilisation"]).
export function useUtilisationQuery() {
  const { data: user } = useMeQuery();
  return useQuery({
    queryKey: ["abonnements", "utilisation"],
    queryFn: () => abonnementsApi.utilisation(),
    enabled: user?.role === "ADMIN",
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function usePlansQuery() {
  return useQuery({
    queryKey: ["plans-abonnement"],
    queryFn: () => plansApi.list(),
    // Même source que SuperAdmin > Tarification : un plan créé, modifié ou désactivé là-bas apparaît ici.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useTransactionsAbonnementQuery() {
  return useQuery({
    queryKey: TRANSACTIONS_KEY,
    queryFn: () => abonnementsApi.transactions(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** Toute opération de paiement change l'état d'abonnement ET l'historique : les deux sont relus. */
function useOperationPaiement(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    // Pas de « return » : une promesse renvoyée ici serait attendue avant les rappels passés à mutate(), et le
    // composant (retiré de l'écran par la relecture de l'état) ne recevrait jamais son onSuccess.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["abonnements"] });
    },
  });
}

export const useSouscrireMutation = () => useOperationPaiement(({ corps, cle }) => abonnementsApi.souscrire(corps, cle));
export const usePayerWaveMutation = () => useOperationPaiement(({ corps, cle }) => abonnementsApi.payerWave(corps, cle));
export const useAnnulerDeclarationMutation = () => useOperationPaiement((id) => abonnementsApi.annuler(id));
export const useVerifierPaiementMutation = () => useOperationPaiement((id) => abonnementsApi.verifier(id));
