import { api } from "../../lib/apiClient.js";

// Réservé au SUPERADMIN — voir backend/src/routes/ateliers.routes.js.
// Gestion des ateliers (tenants) de la plateforme "Gestion d'Atelier",
// distincte de /parametres (un ADMIN gère SON PROPRE atelier, jamais les
// autres).
export const ateliersApi = {
  list: () => api.get("/ateliers"),
  create: (data) => api.post("/ateliers", data),
};
