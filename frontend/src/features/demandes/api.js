import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Gestion ADMIN des demandes de commande envoyées par des clients USER (§
// plan rôle USER, Phase 3) — voir backend/src/routes/demandes.routes.js.
// Aucune logique métier ici, reflet direct des routes.
export const demandesApi = {
  list: (params) => api.get(`/demandes${buildQuery(params)}`),
  get: (id) => api.get(`/demandes/${id}`),
  accepter: (id, commandeId) => api.post(`/demandes/${id}/accepter`, { commandeId }),
  refuser: (id, motifRefus) => api.post(`/demandes/${id}/refuser`, { motifRefus }),
};
