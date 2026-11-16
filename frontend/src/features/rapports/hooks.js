import { useQuery } from "@tanstack/react-query";
import { rapportsApi } from "./api.js";

const opts = (params) => ({ placeholderData: (prev) => prev, ...params });

export function useFinancesQuery(params) {
  return useQuery(opts({ queryKey: ["rapports", "finances", params], queryFn: () => rapportsApi.finances(params) }));
}

export function useEvolutionQuery(params) {
  return useQuery(
    opts({ queryKey: ["rapports", "evolution", params], queryFn: () => rapportsApi.evolution(params) }),
  );
}

export function useCommandesStatsQuery(params) {
  return useQuery(
    opts({ queryKey: ["rapports", "commandes", params], queryFn: () => rapportsApi.commandes(params) }),
  );
}

export function useCommandesEnRetardQuery(params) {
  return useQuery(
    opts({
      queryKey: ["rapports", "commandes", "en-retard", params],
      queryFn: () => rapportsApi.commandesEnRetard(params),
    }),
  );
}

export function useCommandesALivrerQuery(params) {
  return useQuery(
    opts({
      queryKey: ["rapports", "commandes", "a-livrer", params],
      queryFn: () => rapportsApi.commandesALivrer(params),
    }),
  );
}

export function useClientesStatsQuery(params) {
  return useQuery(opts({ queryKey: ["rapports", "clientes", params], queryFn: () => rapportsApi.clientes(params) }));
}

export function useModelesStatsQuery(params) {
  return useQuery(opts({ queryKey: ["rapports", "modeles", params], queryFn: () => rapportsApi.modeles(params) }));
}

// Rapports avancés (6.7) : permission « rapports.avances » ; achats, dépenses et marges exigent aussi « finances.voir ».
export const useProductionRapportQuery = (params) => useQuery(opts({ queryKey: ["rapports", "avances", "production", params], queryFn: () => rapportsApi.production(params) }));
export const useRetardsRapportQuery = (params) => useQuery(opts({ queryKey: ["rapports", "avances", "retards", params], queryFn: () => rapportsApi.retards(params) }));
export const useAchatsFournisseursQuery = (params) => useQuery(opts({ queryKey: ["rapports", "avances", "achats", params], queryFn: () => rapportsApi.achatsFournisseurs(params) }));
export const useDepensesCategoriesQuery = (params) => useQuery(opts({ queryKey: ["rapports", "avances", "depenses", params], queryFn: () => rapportsApi.depensesCategories(params) }));
export const useMargesQuery = (params) => useQuery(opts({ queryKey: ["rapports", "avances", "marges", params], queryFn: () => rapportsApi.marges(params) }));
