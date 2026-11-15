import { api } from "../../lib/apiClient.js";

// Correspondance 1 pour 1 avec backend/src/routes/employes.routes.js (réservé au PDG). Les droits sensibles et la
// réinitialisation d'un mot de passe exigent `confirmationMotDePasse` (le mot de passe du PDG).
const requete = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
};

export const employesApi = {
  catalogue: () => api.get("/employes/catalogue"),
  list: (params) => api.get(`/employes${requete(params)}`),
  get: (id) => api.get(`/employes/${id}`),
  create: (corps, cle) => api.post("/employes", corps, { headers: { "Idempotency-Key": cle } }),
  update: (id, corps) => api.patch(`/employes/${id}`, corps),
  desactiver: (id) => api.post(`/employes/${id}/desactiver`, {}),
  reactiver: (id) => api.post(`/employes/${id}/reactiver`, {}),
  motDePasse: (id, corps) => api.post(`/employes/${id}/mot-de-passe`, corps),
};
