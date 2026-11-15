import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Correspondance 1 pour 1 avec backend/src/routes/fournisseurs.routes.js — aucune logique métier ici.
export const fournisseursApi = {
  list: (params) => api.get(`/fournisseurs${buildQuery(params)}`),
  get: (id) => api.get(`/fournisseurs/${id}`),
  create: (data) => api.post("/fournisseurs", data),
  update: (id, data) => api.patch(`/fournisseurs/${id}`, data),
  archive: (id) => api.post(`/fournisseurs/${id}/archiver`),
  restore: (id) => api.post(`/fournisseurs/${id}/restaurer`),
};
