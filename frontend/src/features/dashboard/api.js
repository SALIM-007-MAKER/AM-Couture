import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Correspondance 1 pour 1 avec backend/src/routes/dashboard.routes.js —
// module purement consultatif, aucune mutation ici.
export const dashboardApi = {
  summary: (params) => api.get(`/dashboard/summary${buildQuery(params)}`),
  recent: (params) => api.get(`/dashboard/recent${buildQuery(params)}`),
};
