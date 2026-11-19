import { api } from "../../lib/apiClient.js";

// Plans d'abonnement de la plateforme (SUPERADMIN) — voir
// backend/src/routes/plans.routes.js. `tous` inclut les plans désactivés.
// Chaque plan porte `tarifs` (totaux/remises calculés par le serveur) et
// `tarifsDuree` (configuration brute des durées proposées).
export const plansAdminApi = {
  tous: () => api.get("/plans-abonnement/tous"),
  creer: (data) => api.post("/plans-abonnement", data),
  modifier: (id, data) => api.patch(`/plans-abonnement/${id}`, data),
  // Ateliers dont l'usage actuel dépasse déjà les limites de la formule (lecture seule).
  depassements: (id) => api.get(`/plans-abonnement/${id}/depassements`),
};

// Contact WhatsApp de la plateforme — voir backend/src/routes/plateforme.routes.js.
export const contactApi = {
  get: () => api.get("/plateforme/contact"),
  save: (whatsapp) => api.put("/plateforme/contact", { whatsapp }),
};
