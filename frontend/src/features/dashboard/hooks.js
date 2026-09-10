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
