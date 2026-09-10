import { useQuery } from "@tanstack/react-query";
import { paiementsApi } from "./api.js";

export function usePaiementsGlobalQuery(params) {
  return useQuery({
    queryKey: ["paiements", "list", params],
    queryFn: () => paiementsApi.list(params),
    placeholderData: (prev) => prev,
  });
}
