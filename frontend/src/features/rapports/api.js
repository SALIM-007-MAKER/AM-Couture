import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Correspondance 1 pour 1 avec backend/src/routes/rapports.routes.js —
// module purement consultatif, aucune mutation ici.
export const rapportsApi = {
  finances: (params) => api.get(`/rapports/finances${buildQuery(params)}`),
  evolution: (params) => api.get(`/rapports/evolution${buildQuery(params)}`),
  commandes: (params) => api.get(`/rapports/commandes${buildQuery(params)}`),
  commandesEnRetard: (params) => api.get(`/rapports/commandes/en-retard${buildQuery(params)}`),
  commandesALivrer: (params) => api.get(`/rapports/commandes/a-livrer${buildQuery(params)}`),
  clientes: (params) => api.get(`/rapports/clientes${buildQuery(params)}`),
  modeles: (params) => api.get(`/rapports/modeles${buildQuery(params)}`),
};
