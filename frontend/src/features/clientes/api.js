import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Aucune logique métier ici : chaque fonction reflète EXACTEMENT une route
// backend déjà validée (voir backend/src/routes/clientes.routes.js et
// mesures.routes.js) — pas de validation, pas de normalisation, pas de règle
// recalculée côté client.
// Chemin direct (flux CSV, pas du JSON) — même origine, le cookie de
// session part automatiquement (voir recuPdfUrl, features/recus/api.js,
// même pattern). Les filtres actifs de la liste sont repris tels quels :
// exporter reflète ce que l'utilisateur voit à l'écran, pas systématiquement
// tout le fichier clients.
export function clientesExportUrl(params) {
  return `/api/clientes/export${buildQuery(params)}`;
}

export const clientesApi = {
  list: (params) => api.get(`/clientes${buildQuery(params)}`),
  get: (id) => api.get(`/clientes/${id}`),
  create: (data) => api.post("/clientes", data),
  update: (id, data) => api.patch(`/clientes/${id}`, data),
  archive: (id) => api.post(`/clientes/${id}/archiver`),
  restore: (id) => api.post(`/clientes/${id}/restaurer`),
  totaux: (id) => api.get(`/clientes/${id}/totaux`),
  mesures: {
    list: (clienteId, params) => api.get(`/clientes/${clienteId}/mesures${buildQuery(params)}`),
    create: (clienteId, data) => api.post(`/clientes/${clienteId}/mesures`, data),
    derniere: (clienteId) => api.get(`/clientes/${clienteId}/mesures/derniere`),
  },
};
