import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Correspondance 1 pour 1 avec backend/src/routes/dashboard.routes.js —
// module purement consultatif, aucune mutation ici.
export const dashboardApi = {
  summary: (params) => api.get(`/dashboard/summary${buildQuery(params)}`),
  recent: (params) => api.get(`/dashboard/recent${buildQuery(params)}`),
  // Mêmes données que /rapports/commandes/*, mais sous dashboard.lire + commandes.lire (voir dashboard.routes.js).
  commandesEnRetard: (params) => api.get(`/dashboard/commandes/en-retard${buildQuery(params)}`),
  commandesALivrer: (params) => api.get(`/dashboard/commandes/a-livrer${buildQuery(params)}`),
};
