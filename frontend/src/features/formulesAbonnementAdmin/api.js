import { api } from "../../lib/apiClient.js";

// Gestion des tarifs d'abonnement par le SUPERADMIN — voir
// backend/src/routes/formulesAbonnement.routes.js. Distinct de
// features/abonnement/api.js (formulesApi.list — ADMIN, formules actives
// uniquement, pour souscrire) : ici on gère TOUTES les formules, actives ou
// non, et on peut créer/modifier.
export const formulesAdminApi = {
  toutes: () => api.get("/formules-abonnement/toutes"),
  creer: (data) => api.post("/formules-abonnement", data),
  modifier: (id, data) => api.patch(`/formules-abonnement/${id}`, data),
};
