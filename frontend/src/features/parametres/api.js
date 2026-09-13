import { api } from "../../lib/apiClient.js";

// Correspondance 1 pour 1 avec backend/src/routes/parametres.routes.js —
// paramètres DE L'ATELIER DE L'UTILISATEUR CONNECTÉ (Phase 8, multi-tenant :
// plus un singleton global). Aucun DELETE : pas exposé côté backend.
// Pas de route "publique" (avant connexion) : avec plusieurs ateliers sur la
// même plateforme, il n'y a plus "un seul" nom/logo à afficher avant que
// l'utilisateur ne soit identifié — voir LoginPage.jsx (branding générique
// "Gestion d'Atelier").
export const parametresApi = {
  get: () => api.get("/parametres"),
  put: (data) => api.put("/parametres", data),
  patch: (data) => api.patch("/parametres", data),
};
