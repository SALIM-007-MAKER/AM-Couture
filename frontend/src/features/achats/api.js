import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Correspondance 1 pour 1 avec backend/src/routes/achats.routes.js — aucune logique métier ici.
export const achatsApi = {
  list: (params) => api.get(`/achats${buildQuery(params)}`),
  options: () => api.get("/achats/options"),
  get: (id) => api.get(`/achats/${id}`),
  create: (data, cle) => api.post("/achats", data, cle ? { headers: { "Idempotency-Key": cle } } : undefined),
  receptionner: (id, lignes) => api.post(`/achats/${id}/receptions`, { lignes }),
  payer: (id) => api.post(`/achats/${id}/paiement`, {}),
  annuler: (id, motif) => api.post(`/achats/${id}/annuler`, { motif }),
};
