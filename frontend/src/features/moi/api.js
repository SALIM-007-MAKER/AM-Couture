import { api } from "../../lib/apiClient.js";

// Espace client final (§ plan rôle USER, Phase 3) — reflet direct des
// routes backend/src/routes/moi.routes.js, toutes déjà scopées par
// req.user.clienteId côté serveur : aucun paramètre d'id à passer ici,
// contrairement à features/clientes/api.js (côté ADMIN).
export const moiApi = {
  profil: () => api.get("/moi"),
  mesures: () => api.get("/moi/mesures"),
  commandes: {
    list: () => api.get("/moi/commandes"),
    get: (id) => api.get(`/moi/commandes/${id}`),
  },
  paiements: () => api.get("/moi/paiements"),
  notifications: {
    list: () => api.get("/moi/notifications"),
    nombreNonLues: () => api.get("/moi/notifications/non-lues"),
    marquerLu: (id, lu) => api.patch(`/moi/notifications/${id}`, { lu }),
  },
  demandes: {
    list: () => api.get("/moi/demandes"),
    create: (data) => api.post("/moi/demandes", data),
  },
  recus: () => api.get("/moi/recus"),
};

// Chemin direct (flux PDF, pas du JSON) — même origine, le cookie de session
// part automatiquement. Voir recuPdfUrl (features/recus/api.js, côté ADMIN),
// même pattern.
export function recuPdfUrl(recuId) {
  return `/api/moi/recus/${recuId}/pdf`;
}
