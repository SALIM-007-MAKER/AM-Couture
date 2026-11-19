import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "./api.js";

export function useDashboardSummaryQuery(params) {
  return useQuery({
    queryKey: ["dashboard", "summary", params],
    queryFn: () => dashboardApi.summary(params),
    placeholderData: (prev) => prev,
  });
}

export function useDashboardRecentQuery(limit) {
  return useQuery({
    queryKey: ["dashboard", "recent", limit],
    queryFn: () => dashboardApi.recent({ limit }),
    placeholderData: (prev) => prev,
  });
}

// Listes « en retard » / « à livrer » du tableau de bord. Passent par /dashboard/* et non /rapports/* : un poste qui a
// dashboard.lire sans rapports.lire (réceptionniste) peut ainsi afficher son tableau de bord.
export function useCommandesEnRetardQuery(params) {
  return useQuery({
    queryKey: ["dashboard", "commandes", "en-retard", params],
    queryFn: () => dashboardApi.commandesEnRetard(params),
    placeholderData: (prev) => prev,
  });
}

export function useCommandesALivrerQuery(params) {
  return useQuery({
    queryKey: ["dashboard", "commandes", "a-livrer", params],
    queryFn: () => dashboardApi.commandesALivrer(params),
    placeholderData: (prev) => prev,
  });
}
