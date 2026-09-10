import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commandesApi } from "./api.js";

export function useCommandesQuery(params) {
  return useQuery({
    queryKey: ["commandes", "list", params],
    queryFn: () => commandesApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useCommandeQuery(id) {
  return useQuery({
    queryKey: ["commandes", "detail", id],
    queryFn: () => commandesApi.get(id),
    enabled: Boolean(id),
  });
}

export function useCreateCommandeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => commandesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commandes", "list"] });
    },
  });
}

// PATCH /commandes/:id et POST /commandes/:id/statut renvoient tous deux une
// ligne Commande "nue" (sans cliente/modele/paiements/livraison ni les
// totaux calculés totalPaye/solde — voir commandes.routes.js, contrairement
// à GET /commandes/:id qui, lui, les inclut). Écrire cette réponse partielle
// directement dans le cache du détail avec setQueryData écraserait ces
// champs par `undefined` et ferait planter CommandeDetailPage au rendu
// suivant (`commande.cliente.id` sur `undefined` — bug réel reproduit en
// testant un changement de statut dans un vrai navigateur). On invalide
// systématiquement à la place, ce qui redéclenche le vrai GET complet.
export function useUpdateCommandeMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => commandesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commandes", "detail", id] });
      queryClient.invalidateQueries({ queryKey: ["commandes", "list"] });
    },
  });
}

export function useChangeStatutMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (statut) => commandesApi.changeStatut(id, statut),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commandes", "detail", id] });
      queryClient.invalidateQueries({ queryKey: ["commandes", "list"] });
    },
  });
}

export function usePaiementsQuery(commandeId, params) {
  return useQuery({
    queryKey: ["commandes", commandeId, "paiements", "list", params],
    queryFn: () => commandesApi.paiements.list(commandeId, params),
    enabled: Boolean(commandeId),
    placeholderData: (prev) => prev,
  });
}

export function useCreatePaiementMutation(commandeId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => commandesApi.paiements.create(commandeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commandes", commandeId, "paiements"] });
      // Le solde/totalPaye affichés sur la fiche commande dépendent des
      // paiements : invalider aussi le détail et la liste de la commande.
      queryClient.invalidateQueries({ queryKey: ["commandes", "detail", commandeId] });
      queryClient.invalidateQueries({ queryKey: ["commandes", "list"] });
    },
  });
}

export function useLivraisonsQuery(commandeId, params) {
  return useQuery({
    queryKey: ["commandes", commandeId, "livraisons", "list", params],
    queryFn: () => commandesApi.livraisons.list(commandeId, params),
    enabled: Boolean(commandeId),
    placeholderData: (prev) => prev,
  });
}

export function useCreateLivraisonMutation(commandeId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => commandesApi.livraisons.create(commandeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commandes", commandeId, "livraisons"] });
      queryClient.invalidateQueries({ queryKey: ["commandes", commandeId, "paiements"] });
      queryClient.invalidateQueries({ queryKey: ["commandes", "detail", commandeId] });
      queryClient.invalidateQueries({ queryKey: ["commandes", "list"] });
    },
  });
}

// Annulation d'un paiement/livraison : le solde et le statut de la commande
// peuvent changer (voir backend) — mêmes invalidations que la création.
export function useAnnulerPaiementMutation(commandeId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paiementId, motif }) => commandesApi.paiements.annuler(commandeId, paiementId, motif),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commandes", commandeId, "paiements"] });
      queryClient.invalidateQueries({ queryKey: ["commandes", "detail", commandeId] });
      queryClient.invalidateQueries({ queryKey: ["commandes", "list"] });
    },
  });
}

export function useAnnulerLivraisonMutation(commandeId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ livraisonId, motif }) => commandesApi.livraisons.annuler(commandeId, livraisonId, motif),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commandes", commandeId, "livraisons"] });
      // Le statut de la commande peut revenir de LIVREE à TERMINEE — invalider le détail/liste.
      queryClient.invalidateQueries({ queryKey: ["commandes", "detail", commandeId] });
      queryClient.invalidateQueries({ queryKey: ["commandes", "list"] });
    },
  });
}
