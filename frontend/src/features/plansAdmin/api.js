import { api } from "../../lib/apiClient.js";

// Plans d'abonnement de la plateforme (SUPERADMIN) — voir
// backend/src/routes/plans.routes.js. `tous` inclut les plans désactivés.
// Chaque plan porte `prixMensuel` / `prixAnnuel` (XOF, entiers, optionnels), ses `offres`, l'économie annuelle informative,
// `proposee` et `activationPossible` (calculés par le serveur).
export const plansAdminApi = {
  tous: () => api.get("/plans-abonnement/tous"),
  creer: (data) => api.post("/plans-abonnement", data),
  modifier: (id, data) => api.patch(`/plans-abonnement/${id}`, data),
  // Ateliers dont l'usage actuel dépasse déjà les limites de la formule (lecture seule).
  depassements: (id) => api.get(`/plans-abonnement/${id}/depassements`),
  // Ateliers actuellement abonnés à la formule, prix figés et revenu mensuel récurrent (lecture seule).
  abonnes: (id) => api.get(`/plans-abonnement/${id}/abonnes`),
};

// Contact WhatsApp de la plateforme — voir backend/src/routes/plateforme.routes.js.
export const contactApi = {
  get: () => api.get("/plateforme/contact"),
  save: (whatsapp) => api.put("/plateforme/contact", { whatsapp }),
};
