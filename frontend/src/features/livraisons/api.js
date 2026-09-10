import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Liste GLOBALE (toutes commandes confondues) — lecture seule, voir
// GET /api/livraisons (backend/src/routes/livraisons.routes.js,
// livraisonsGlobalRouter). La création/annulation reste exclusivement via
// la fiche Commande (features/commandes/api.js).
export const livraisonsApi = {
  list: (params) => api.get(`/livraisons${buildQuery(params)}`),
};
