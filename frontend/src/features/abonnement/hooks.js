import { useQuery } from "@tanstack/react-query";
import { abonnementsApi, plansApi } from "./api.js";

// Rafraîchi tout seul (30 s + au retour sur l'onglet) : une activation ou
// désactivation faite par le SUPERADMIN apparaît chez le PDG sans qu'il ait à
// recharger la page.
export function useEtatAbonnementQuery() {
  return useQuery({
    queryKey: ["abonnements", "etat"],
    queryFn: () => abonnementsApi.etat(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function usePlansQuery() {
  return useQuery({
    queryKey: ["plans-abonnement"], queryFn: () => plansApi.list(),
    // Même source que SuperAdmin > Tarification : un plan créé, modifié ou
    // désactivé là-bas apparaît ici sans recharger la page.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
