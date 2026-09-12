import { api } from "../../lib/apiClient.js";
import { buildQuery } from "../../lib/queryString.js";

// Aucune logique métier ici : chaque fonction reflète EXACTEMENT une route
// backend déjà validée (voir backend/src/routes/clientes.routes.js et
// mesures.routes.js) — pas de validation, pas de normalisation, pas de règle
// recalculée côté client.
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
