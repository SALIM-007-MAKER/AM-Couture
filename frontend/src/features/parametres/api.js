import { api } from "../../lib/apiClient.js";

// Correspondance 1 pour 1 avec backend/src/routes/parametres.routes.js —
// singleton (pas d'id dans l'URL). Aucun DELETE : pas exposé côté backend.
export const parametresApi = {
  get: () => api.get("/parametres"),
  put: (data) => api.put("/parametres", data),
  patch: (data) => api.patch("/parametres", data),
  // Sans authentification (voir backend) — utilisé uniquement par la page de
  // connexion pour afficher le vrai nom/logo de l'atelier.
  getPublic: () => api.get("/parametres/public"),
};
