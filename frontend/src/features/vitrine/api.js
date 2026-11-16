import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Correspondance 1 pour 1 avec backend/src/routes/vitrine.routes.js (réglages du PDG) et vitrinePublique.routes.js
// (lecture publique, sans compte).
export const vitrineApi = {
  reglages: () => api.get("/vitrine"),
  modifier: (corps) => api.patch("/vitrine", corps),
  envoyerDemande: (slug, corps) => api.post(`/public/vitrines/${encodeURIComponent(slug)}/demandes`, corps),
  publique: (slug, params) => api.get(`/public/vitrines/${encodeURIComponent(slug)}${buildQuery(params)}`),
};
