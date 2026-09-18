import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Correspondance 1 pour 1 avec les routes backend (voir
// backend/src/routes/abonnements.routes.js, transactions.routes.js,
// formulesAbonnement.routes.js) — aucune logique métier ici.
export const formulesApi = {
  list: () => api.get("/formules-abonnement"),
};

export const abonnementsApi = {
  list: (params) => api.get(`/abonnements${buildQuery(params)}`),
  actuel: () => api.get("/abonnements/actuel"),
  get: (id) => api.get(`/abonnements/${id}`),
  creer: (data) => api.post("/abonnements", data),
  config: () => api.get("/abonnements/config"),
};

export const transactionsApi = {
  get: (id) => api.get(`/transactions/${id}`),
  confirmerManuel: (id) => api.post(`/transactions/${id}/confirmer-manuel`, {}),
  rejeterManuel: (id) => api.post(`/transactions/${id}/rejeter-manuel`, {}),
  simulerMock: (id, resultat) => api.post(`/transactions/${id}/simuler-mock`, { resultat }),
};
