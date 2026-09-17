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
  notifications: () => api.get("/moi/notifications"),
  demandes: {
    list: () => api.get("/moi/demandes"),
    create: (data) => api.post("/moi/demandes", data),
  },
};
