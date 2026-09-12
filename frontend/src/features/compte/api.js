import { api } from "../../lib/apiClient.js";

// Correspondance 1 pour 1 avec les routes backend (voir
// backend/src/routes/compte.routes.js) — aucune logique métier ici.
export const compteApi = {
  updatePreferences: (data) => api.patch("/compte", data),
  changerMotDePasse: (data) => api.patch("/compte/mot-de-passe", data),
};
