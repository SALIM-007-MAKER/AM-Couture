import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Correspondance 1 pour 1 avec les routes backend (voir
// backend/src/routes/recus.routes.js et paiements.routes.js) — un reçu n'a
// aucun champ saisissable côté client (.strict() sur objet vide côté
// backend), d'où les corps `{}` explicites ci-dessous.
export const recusApi = {
  listForCommande: (commandeId, params) => api.get(`/commandes/${commandeId}/recus${buildQuery(params)}`),
  createRecapitulatif: (commandeId) => api.post(`/commandes/${commandeId}/recus`, {}),
  createForPaiement: (commandeId, paiementId) => api.post(`/commandes/${commandeId}/paiements/${paiementId}/recu`, {}),
  // Liste GLOBALE (toutes commandes confondues) — voir GET /api/recus (lecture
  // seule, backend/src/routes/recus.routes.js).
  list: (params) => api.get(`/recus${buildQuery(params)}`),
};

// Chemin direct (pas un appel `api.*` : ce n'est pas du JSON mais un flux
// PDF) — même origine, le cookie de session part automatiquement.
export function recuPdfUrl(recuId) {
  return `/api/recus/${recuId}/pdf`;
}
