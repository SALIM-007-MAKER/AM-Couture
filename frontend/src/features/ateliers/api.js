import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Réservé au SUPERADMIN — voir backend/src/routes/ateliers.routes.js.
// Gestion des ateliers (tenants) de la plateforme "Gestion d'Atelier",
// distincte de /parametres (un ADMIN gère SON PROPRE atelier, jamais les
// autres).
export const ateliersApi = {
  list: (params) => api.get(`/ateliers${buildQuery(params)}`),
  resume: () => api.get("/ateliers/resume"),
  alertes: () => api.get("/ateliers/alertes"),
  tendances: () => api.get("/ateliers/tendances"),
  abonnements: () => api.get("/ateliers/abonnements"),
  get: (id) => api.get(`/ateliers/${id}`),
  activite: (id) => api.get(`/ateliers/${id}/activite`),
  create: (data) => api.post("/ateliers", data),
  update: (id, data) => api.patch(`/ateliers/${id}`, data),
  updateStatut: (id, actif) => api.patch(`/ateliers/${id}/statut`, { actif }),
  reinitialiserMotDePasse: (atelierId, userId, nouveauMotDePasse) =>
    api.patch(`/ateliers/${atelierId}/comptes/${userId}/mot-de-passe`, { nouveauMotDePasse }),
  remove: (id) => api.delete(`/ateliers/${id}`),
  ajouterCompte: (atelierId, data) => api.post(`/ateliers/${atelierId}/comptes`, data),
  supprimerCompte: (atelierId, userId) => api.delete(`/ateliers/${atelierId}/comptes/${userId}`),
  impersoner: (atelierId, userId) => api.post(`/ateliers/${atelierId}/comptes/${userId}/impersonation`),
  impersonations: (atelierId) => api.get(`/ateliers/${atelierId}/impersonations`),
};
