import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ateliersApi } from "./api.js";

const LIST_KEY = ["ateliers", "list"];
const RESUME_KEY = ["ateliers", "resume"];
const ABONNEMENTS_KEY = ["ateliers", "abonnements"];
const detailKey = (id) => ["ateliers", id];
const activiteKey = (id) => ["ateliers", id, "activite"];

export function useAteliersQuery(params) {
  return useQuery({
    queryKey: [...LIST_KEY, params],
    queryFn: () => ateliersApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useAteliersResumeQuery() {
  return useQuery({ queryKey: RESUME_KEY, queryFn: () => ateliersApi.resume() });
}

export function useAteliersAbonnementsQuery() {
  return useQuery({ queryKey: ABONNEMENTS_KEY, queryFn: () => ateliersApi.abonnements() });
}

export function useAteliersAlertesQuery() {
  return useQuery({ queryKey: ["ateliers", "alertes"], queryFn: () => ateliersApi.alertes() });
}

export function useAteliersTendancesQuery() {
  return useQuery({ queryKey: ["ateliers", "tendances"], queryFn: () => ateliersApi.tendances() });
}

export function useAtelierQuery(id) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => ateliersApi.get(id), enabled: Boolean(id) });
}

export function useAtelierActiviteQuery(id) {
  return useQuery({ queryKey: activiteKey(id), queryFn: () => ateliersApi.activite(id), enabled: Boolean(id) });
}

export function useCreateAtelierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => ateliersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: RESUME_KEY });
    },
  });
}

export function useUpdateAtelierMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => ateliersApi.update(id, data),
    onSuccess: (atelier) => {
      queryClient.setQueryData(detailKey(id), (prev) => (prev ? { ...prev, ...atelier } : atelier));
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

export function useUpdateStatutAtelierMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (actif) => ateliersApi.updateStatut(id, actif),
    onSuccess: (atelier) => {
      queryClient.setQueryData(detailKey(id), (prev) => (prev ? { ...prev, ...atelier } : atelier));
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: RESUME_KEY });
    },
  });
}

// Dernier recours (voir backend/src/lib/atelierProvisioning.js) — pas
// d'invalidation de cache nécessaire : ne change aucune donnée affichée
// ailleurs (le hash n'est jamais exposé au frontend).
export function useReinitialiserMotDePasseMutation(atelierId) {
  return useMutation({
    mutationFn: ({ userId, nouveauMotDePasse }) =>
      ateliersApi.reinitialiserMotDePasse(atelierId, userId, nouveauMotDePasse),
  });
}

// Suppression DÉFINITIVE — le backend refuse déjà (409) tout atelier non
// vide (voir ateliers.routes.js) : pas de garde-fou dupliqué côté frontend,
// une seule source de vérité sur ce qui est "supprimable".
export function useDeleteAtelierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => ateliersApi.remove(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: detailKey(id) });
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: RESUME_KEY });
    },
  });
}

// Ajout d'un compte ("employé") — mêmes permissions que l'ADMIN de l'atelier
// (voir ajouterCompteSchema, atelierAdmin.schema.js).
export function useAjouterCompteMutation(atelierId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => ateliersApi.ajouterCompte(atelierId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: detailKey(atelierId) }),
  });
}

// Le backend refuse déjà (409) de supprimer le dernier compte d'un atelier —
// pas de garde-fou dupliqué côté frontend.
export function useSupprimerCompteMutation(atelierId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId) => ateliersApi.supprimerCompte(atelierId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: detailKey(atelierId) }),
  });
}

// Démarre une impersonation (voir POST .../impersonation, ateliers.routes.js)
// — le cookie de session devient celui du compte ADMIN ciblé. `clear()` :
// même raisonnement que useQuitterImpersonationMutation (useAuth.js), on
// quitte entièrement le contexte SUPERADMIN (Ateliers, Abonnements...) qui
// n'a plus lieu d'être en cache tant que l'impersonation dure.
export function useImpersonerMutation(atelierId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId) => ateliersApi.impersoner(atelierId, userId),
    onSuccess: () => queryClient.clear(),
  });
}

export function useImpersonationsQuery(atelierId) {
  return useQuery({
    queryKey: ["ateliers", atelierId, "impersonations"],
    queryFn: () => ateliersApi.impersonations(atelierId),
    enabled: Boolean(atelierId),
  });
}

const abonnementKey = (id) => ["ateliers", id, "abonnement"];

export function useAtelierAbonnementQuery(atelierId) {
  return useQuery({
    queryKey: abonnementKey(atelierId),
    queryFn: () => ateliersApi.abonnement(atelierId),
    enabled: Boolean(atelierId),
  });
}

// Après chaque action : la fiche de l'atelier ET la vue d'ensemble des
// abonnements se rafraîchissent (le PDG voit le changement à son prochain
// rafraîchissement automatique, voir features/abonnement).
function useAbonnementMutation(atelierId, mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: abonnementKey(atelierId) });
      queryClient.invalidateQueries({ queryKey: ABONNEMENTS_KEY });
    },
  });
}

export function useActiverAbonnementMutation(atelierId) {
  return useAbonnementMutation(atelierId, (data) => ateliersApi.activerAbonnement(atelierId, data));
}

export function useModifierAbonnementMutation(atelierId) {
  return useAbonnementMutation(atelierId, ({ abonnementId, data }) =>
    ateliersApi.modifierAbonnement(atelierId, abonnementId, data),
  );
}

export function useExpirerAbonnementMutation(atelierId) {
  return useAbonnementMutation(atelierId, ({ abonnementId, note }) =>
    ateliersApi.expirerAbonnement(atelierId, abonnementId, note ? { note } : {}),
  );
}

export function useDesactiverAbonnementMutation(atelierId) {
  return useAbonnementMutation(atelierId, ({ abonnementId, note }) =>
    ateliersApi.desactiverAbonnement(atelierId, abonnementId, note ? { note } : {}),
  );
}
