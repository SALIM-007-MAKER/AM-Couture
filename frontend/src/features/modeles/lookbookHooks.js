import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/apiClient.js";

// Le détail d'un modèle contient les photos : chaque opération le relit (les réponses partielles de PATCH / des photos
// ne portent pas la galerie complète — voir features/commandes/hooks.js pour la même précaution).
function useOperation(id, fn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modeles", "detail", id] });
      queryClient.invalidateQueries({ queryKey: ["modeles", "list"] });
    },
  });
}

export const useAjouterPhotoMutation = (id) => useOperation(id, (corps) => api.post(`/modeles/${id}/photos`, corps));
export const useSupprimerPhotoMutation = (id) => useOperation(id, (photoId) => api.delete(`/modeles/${id}/photos/${photoId}`));
export const useOrdrePhotosMutation = (id) => useOperation(id, (ids) => api.put(`/modeles/${id}/photos/ordre`, { ids }));
export const usePublierModeleMutation = (id) => useOperation(id, (corps) => api.patch(`/modeles/${id}`, corps));
