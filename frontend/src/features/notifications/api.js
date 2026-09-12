import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Correspondance 1 pour 1 avec les routes backend (voir
// backend/src/routes/notifications.routes.js) — aucune logique métier ici.
export const notificationsApi = {
  list: (params) => api.get(`/notifications${buildQuery(params)}`),
  nombreNonLues: () => api.get("/notifications/nombre-non-lues"),
  marquerLu: (id, lu = true) => api.patch(`/notifications/${id}`, { lu }),
  marquerLuMasse: (ids) => api.post("/notifications/marquer-lu", { ids }),
  supprimerMasse: (ids) => api.post("/notifications/supprimer", { ids }),
};
