import { api } from "../../lib/apiClient.js";

// Routes SUPERADMIN de vérification des paiements d'abonnement et du tableau de bord commercial
// (voir backend/src/routes/plateforme.routes.js et commerce.routes.js). Le serveur applique chaque décision une seule
// fois : rejouer une confirmation renvoie `dejaTraitee: true` sans rien refaire.
const requete = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
};

export const paiementsAdminApi = {
  liste: (params) => api.get(`/plateforme/transactions${requete(params)}`),
  aValider: () => api.get("/plateforme/paiements-a-valider"),
  confirmer: (id) => api.post(`/plateforme/transactions/${id}/confirmer`, {}),
  rejeter: (id, motif) => api.post(`/plateforme/transactions/${id}/rejeter`, { motif }),
  rembourser: (id, motif) => api.post(`/plateforme/transactions/${id}/rembourser`, { motif }),
  urlFacture: (id) => `/api/plateforme/factures/${id}/pdf`,
};

export const commerceApi = {
  synthese: () => api.get("/plateforme/commerce/synthese"),
  revenus: (mois) => api.get(`/plateforme/commerce/revenus${requete({ mois })}`),
  renouvellements: (jours) => api.get(`/plateforme/commerce/renouvellements${requete({ jours })}`),
  parametres: () => api.get("/plateforme/parametres-abonnement"),
  enregistrerParametres: (data) => api.put("/plateforme/parametres-abonnement", data),
};
