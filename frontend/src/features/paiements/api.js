import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Liste GLOBALE (toutes commandes confondues) — lecture seule, voir
// GET /api/paiements (backend/src/routes/paiements.routes.js,
// paiementsGlobalRouter). La création/annulation d'un paiement reste
// exclusivement via la fiche Commande (features/commandes/api.js) : elle
// seule connaît le contexte nécessaire (solde disponible, verrou).
export const paiementsApi = {
  list: (params) => api.get(`/paiements${buildQuery(params)}`),
};
