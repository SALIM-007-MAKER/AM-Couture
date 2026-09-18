import { api } from "../../lib/apiClient.js";

// Plans d'abonnement de la plateforme (SUPERADMIN) — voir
// backend/src/routes/plans.routes.js. `tous` inclut les plans désactivés.
export const plansAdminApi = {
  tous: () => api.get("/plans-abonnement/tous"),
  creer: (data) => api.post("/plans-abonnement", data),
  modifier: (id, data) => api.patch(`/plans-abonnement/${id}`, data),
};
