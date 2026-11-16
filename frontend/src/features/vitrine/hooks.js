import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vitrineApi } from "./api.js";

export const useReglagesVitrineQuery = () => useQuery({ queryKey: ["vitrine", "reglages"], queryFn: () => vitrineApi.reglages() });

export function useModifierVitrineMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (corps) => vitrineApi.modifier(corps),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vitrine", "reglages"] });
    },
  });
}

export const useVitrinePubliqueQuery = (slug, params) =>
  useQuery({
    queryKey: ["vitrine", "publique", slug, params],
    queryFn: () => vitrineApi.publique(slug, params),
    placeholderData: (prev) => prev,
    retry: false, // 404 = vitrine absente ou désactivée : inutile de réessayer
  });
