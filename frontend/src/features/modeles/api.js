import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Correspondance 1 pour 1 avec les routes backend (voir
// backend/src/routes/modeles.routes.js) — aucune logique métier ici.
export const modelesApi = {
  list: (params) => api.get(`/modeles${buildQuery(params)}`),
  get: (id) => api.get(`/modeles/${id}`),
  create: (data) => api.post("/modeles", data),
  update: (id, data) => api.patch(`/modeles/${id}`, data),
  archive: (id) => api.post(`/modeles/${id}/archiver`),
  restore: (id) => api.post(`/modeles/${id}/restaurer`),
};
