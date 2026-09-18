import { api } from "../../lib/apiClient.js";

// Correspondance 1 pour 1 avec les routes backend (voir
// backend/src/routes/abonnements.routes.js et plans.routes.js) — LECTURE
// SEULE : aucune souscription ni paiement côté atelier, l'abonnement est
// activé manuellement par le SUPERADMIN.
export const abonnementsApi = {
  etat: () => api.get("/abonnements/etat"),
};

export const plansApi = {
  list: () => api.get("/plans-abonnement"),
};
