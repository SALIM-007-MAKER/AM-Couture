// Ports du serveur API et du frontend de test. Par défaut ceux du développement (4000 / 5173) ; pour lancer les E2E à côté
// de serveurs de développement déjà ouverts, définir E2E_PORT_API et E2E_PORT_WEB (ports libres). Le proxy de Vite suit via
// VITE_API_PORT (voir frontend/vite.config.js).
export const PORT_API = Number(process.env.E2E_PORT_API ?? 4000);
export const PORT_WEB = Number(process.env.E2E_PORT_WEB ?? 5173);
