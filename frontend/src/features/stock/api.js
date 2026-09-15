import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Correspondance 1 pour 1 avec les routes backend (voir
// backend/src/routes/stock.routes.js) — aucune logique métier ici.
export const stockApi = {
  list: (params) => api.get(`/stock${buildQuery(params)}`),
  get: (id) => api.get(`/stock/${id}`),
  create: (data) => api.post("/stock", data),
  update: (id, data) => api.patch(`/stock/${id}`, data),
  archive: (id) => api.post(`/stock/${id}/archiver`),
  restore: (id) => api.post(`/stock/${id}/restaurer`),
  alertes: () => api.get("/stock/alertes"),
  mouvements: {
    list: (articleId, params) => api.get(`/stock/${articleId}/mouvements${buildQuery(params)}`),
    create: (articleId, data) => api.post(`/stock/${articleId}/mouvements`, data),
  },
};

// Chemin direct (flux CSV, pas du JSON) — même origine, le cookie de session
// part automatiquement (voir clientesExportUrl, features/clientes/api.js).
export function stockExportUrl(params) {
  return `/api/stock/export${buildQuery(params)}`;
}
