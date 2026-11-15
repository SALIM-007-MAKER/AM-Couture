import { journaliser } from "../lib/logger.js";

// Journal d'accès : une ligne par requête terminée (ou interrompue par le client), avec la référence
// `requestId` (la même que l'en-tête X-Request-Id et que les lignes d'erreur), la route, le statut,
// la durée et l'identité technique. Permet de répondre à « que s'est-il passé sur cette requête, et
// combien de temps cela a-t-il pris ? » sans reproduire le problème.
//
// Jamais : query-string, corps, en-têtes, cookies. Désactivé en test (LOG_REQUETES=1 pour l'activer).
// Seuil « requête lente » : LOG_SEUIL_LENT_MS (défaut 1000). LOG_REQUETES=0 désactive le journal.

const SEUIL_LENT_PAR_DEFAUT_MS = 1000;

function actif(env) {
  if (env.LOG_REQUETES === "0") return false;
  if (env.LOG_REQUETES === "1") return true;
  return env.NODE_ENV !== "test";
}

export function seuilLentMs(env = process.env) {
  const n = Number(env.LOG_SEUIL_LENT_MS);
  return Number.isFinite(n) && n > 0 ? n : SEUIL_LENT_PAR_DEFAUT_MS;
}

export function requestLog(req, res, next) {
  if (!actif(process.env)) return next();
  const debut = process.hrtime.bigint();
  res.on("close", () => {
    const chemin = String(req.originalUrl ?? req.url ?? "").split("?")[0];
    // Sondes de santé : bruit sans valeur diagnostique tant qu'elles réussissent.
    if (chemin.startsWith("/api/health") && res.statusCode < 400) return;
    const dureeMs = Math.round(Number(process.hrtime.bigint() - debut) / 1e6);
    const lent = dureeMs >= seuilLentMs();
    const interrompue = !res.writableFinished;
    const route = req.route?.path ? `${req.baseUrl ?? ""}${req.route.path}` : undefined;
    journaliser(res.statusCode >= 500 || lent || interrompue ? "warn" : "info", "requete", {
      requestId: req.id,
      methode: req.method,
      chemin,
      ...(route ? { route } : {}),
      status: res.statusCode,
      dureeMs,
      ...(lent ? { lent: true } : {}),
      ...(interrompue ? { interrompue: true } : {}),
      ...(req.user ? { userId: req.user.id, atelierId: req.user.atelierId, role: req.user.role } : {}),
    });
  });
  next();
}
