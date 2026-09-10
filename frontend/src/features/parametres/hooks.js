import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parametresApi } from "./api.js";

const QUERY_KEY = ["parametres"];

export function useParametresQuery() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => parametresApi.get(),
    // Un 404 (pas encore configuré) est un état normal, pas une erreur
    // transitoire à retenter — voir la politique globale (queryClient.js)
    // qui ne retente déjà aucune 4xx.
    retry: false,
  });
}

// Sans authentification — utilisée par LoginPage. Jamais retentée en boucle
// ni affichée comme une erreur si elle échoue : la page de connexion garde
// alors simplement son repli (icône + "AM Couture" génériques).
export function useParametresPublicQuery() {
  return useQuery({
    queryKey: ["parametres", "public"],
    queryFn: () => parametresApi.getPublic(),
    retry: false,
  });
}

export function usePutParametresMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => parametresApi.put(data),
    onSuccess: (atelier) => {
      queryClient.setQueryData(QUERY_KEY, atelier);
    },
  });
}

export function usePatchParametresMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => parametresApi.patch(data),
    onSuccess: (atelier) => {
      queryClient.setQueryData(QUERY_KEY, atelier);
    },
  });
}
