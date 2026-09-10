import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Correspondance 1 pour 1 avec les routes backend (voir
// backend/src/routes/depenses.routes.js) — aucune logique métier ici.
// Toujours pas de PATCH/DELETE : une dépense reste un événement financier
// historique. Seule une annulation logique (annuler) permet de corriger une
// erreur de saisie, sans jamais modifier la ligne d'origine.
export const depensesApi = {
  list: (params) => api.get(`/depenses${buildQuery(params)}`),
  get: (id) => api.get(`/depenses/${id}`),
  create: (data) => api.post("/depenses", data),
  stats: (params) => api.get(`/depenses/stats${buildQuery(params)}`),
  annuler: (id, motif) => api.post(`/depenses/${id}/annuler`, { motif }),
};
