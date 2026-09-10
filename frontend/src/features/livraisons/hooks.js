import { useQuery } from "@tanstack/react-query";
import { livraisonsApi } from "./api.js";

export function useLivraisonsGlobalQuery(params) {
  return useQuery({
    queryKey: ["livraisons", "list", params],
    queryFn: () => livraisonsApi.list(params),
    placeholderData: (prev) => prev,
  });
}
