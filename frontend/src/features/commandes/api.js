import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Correspondance 1 pour 1 avec les routes backend (voir
// backend/src/routes/commandes.routes.js, paiements.routes.js,
// livraisons.routes.js) — aucune logique métier ici.
export const commandesApi = {
  list: (params) => api.get(`/commandes${buildQuery(params)}`),
  get: (id) => api.get(`/commandes/${id}`),
  create: (data) => api.post("/commandes", data),
  update: (id, data) => api.patch(`/commandes/${id}`, data),
  changeStatut: (id, statut) => api.post(`/commandes/${id}/statut`, { statut }),
  paiements: {
    list: (commandeId, params) => api.get(`/commandes/${commandeId}/paiements${buildQuery(params)}`),
    create: (commandeId, data) => api.post(`/commandes/${commandeId}/paiements`, data),
    annuler: (commandeId, paiementId, motif) =>
      api.post(`/commandes/${commandeId}/paiements/${paiementId}/annuler`, { motif }),
  },
  livraisons: {
    list: (commandeId, params) => api.get(`/commandes/${commandeId}/livraisons${buildQuery(params)}`),
    create: (commandeId, data) => api.post(`/commandes/${commandeId}/livraisons`, data),
    annuler: (commandeId, livraisonId, motif) =>
      api.post(`/commandes/${commandeId}/livraisons/${livraisonId}/annuler`, { motif }),
  },
};
