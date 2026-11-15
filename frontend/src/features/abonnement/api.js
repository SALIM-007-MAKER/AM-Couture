import { api } from "../../lib/apiClient.js";

// Correspondance 1 pour 1 avec les routes backend (voir backend/src/routes/abonnements.routes.js et plans.routes.js).
// Rien de ce qui est envoyé ici ne fixe un montant ni ne confirme un paiement : le serveur calcule le prix et
// ne confirme qu'après vérification (décision du SUPERADMIN, ou relecture chez Wave).
const enteteIdempotence = (cle) => ({ headers: { "Idempotency-Key": cle } });

export const abonnementsApi = {
  etat: () => api.get("/abonnements/etat"),
  souscrire: (corps, cle) => api.post("/abonnements/souscrire", corps, enteteIdempotence(cle)),
  payerWave: (corps, cle) => api.post("/abonnements/payer-wave", corps, enteteIdempotence(cle)),
  transactions: () => api.get("/abonnements/transactions"),
  annuler: (id) => api.post(`/abonnements/transactions/${id}/annuler`, {}),
  verifier: (id) => api.post(`/abonnements/transactions/${id}/verifier`, {}),
  // Lien de téléchargement (le cookie de session part avec la navigation : même origine).
  urlFacture: (id) => `/api/abonnements/factures/${id}/pdf`,
};

export const plansApi = {
  list: () => api.get("/plans-abonnement"),
};
