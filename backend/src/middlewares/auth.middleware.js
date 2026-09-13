import { verifyAuthToken } from "../lib/jwt.js";
import { COOKIE_NAME } from "../lib/authCookie.js";
import { HttpError } from "./error.middleware.js";

/**
 * Protège une route : exige un cookie de session valide.
 * Attache req.user = { id, identifiant, role, atelierId } (jamais passwordHash).
 * role/atelierId (Phase 8) viennent directement du JWT — voir lib/jwt.js.
 */
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return next(new HttpError(401, "Authentification requise."));
  }
  try {
    const payload = verifyAuthToken(token);
    req.user = { id: payload.sub, identifiant: payload.identifiant, role: payload.role, atelierId: payload.atelierId };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * À utiliser APRÈS requireAuth sur toutes les routes opérationnelles d'un
 * atelier (Clientes, Commandes, Modèles, Paiements, Dépenses, Reçus,
 * Dashboard, Rapports, Notifications, Paramètres, Abonnement...) : exige un
 * compte ADMIN rattaché à un atelier. Un SUPERADMIN n'opère jamais
 * directement sur les données d'un atelier — il gère la plateforme (voir
 * ateliers.routes.js) et se connecterait avec un compte ADMIN pour agir "en
 * tant que" tel ou tel atelier si besoin (non implémenté dans cette phase).
 */
export function requireAtelier(req, res, next) {
  if (!req.user?.atelierId) {
    return next(
      new HttpError(
        403,
        "Un compte SUPERADMIN n'accède pas directement aux données d'un atelier — connectez-vous avec un compte ADMIN de cet atelier.",
      ),
    );
  }
  next();
}

/**
 * À utiliser APRÈS requireAuth sur les routes réservées à la plateforme
 * (gestion des ateliers/tenants — voir ateliers.routes.js).
 */
export function requireSuperadmin(req, res, next) {
  if (req.user?.role !== "SUPERADMIN") {
    return next(new HttpError(403, "Réservé au SUPERADMIN de la plateforme."));
  }
  next();
}
