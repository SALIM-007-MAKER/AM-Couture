import { verifyAuthToken } from "../lib/jwt.js";
import { COOKIE_NAME } from "../lib/authCookie.js";
import { HttpError } from "./error.middleware.js";
import { prisma } from "../lib/prisma.js";

/**
 * Protège une route : exige un cookie de session valide.
 * Attache req.user = { id, identifiant, role, atelierId } (jamais passwordHash).
 * role/atelierId (Phase 8) viennent directement du JWT — voir lib/jwt.js.
 *
 * Vérifie aussi `sessionVersion` EN BASE, à chaque requête : un JWT reste
 * valide par construction jusqu'à son expiration (7 jours) même si le mot
 * de passe du compte a changé entre-temps — sans cette vérification, changer
 * son mot de passe ne déconnectait aucune AUTRE session déjà ouverte
 * ailleurs (perdue/volée, oubliée sur un poste partagé...). Coût accepté :
 * un lookup PK supplémentaire par requête authentifiée, sur une ligne déjà
 * quasi systématiquement relue juste après par la route elle-même (voir
 * même raisonnement pour requireAtelier, ci-dessous).
 */
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return next(new HttpError(401, "Authentification requise."));
  }
  try {
    const payload = verifyAuthToken(token);
    const compte = await prisma.user.findUnique({ where: { id: payload.sub }, select: { sessionVersion: true } });
    if (!compte || compte.sessionVersion !== payload.sessionVersion) {
      return next(new HttpError(401, "Session expirée — reconnectez-vous."));
    }
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
 *
 * Vérifie aussi que l'atelier n'est pas suspendu — EN BASE, à CHAQUE requête
 * (pas seulement à la connexion) : une suspension décidée par le SUPERADMIN
 * doit prendre effet immédiatement, même pour une session déjà ouverte
 * (le JWT reste valide jusqu'à 7 jours, voir jwt.js — il ne peut pas à lui
 * seul refléter un changement d'état survenu après son émission). Coût
 * accepté : un lookup PK supplémentaire par requête atelier-scopée, sur une
 * table minuscule (une ligne par atelier) — négligeable face aux requêtes
 * métier qui suivent de toute façon dans la même route.
 */
export async function requireAtelier(req, res, next) {
  if (!req.user?.atelierId) {
    return next(
      new HttpError(
        403,
        "Un compte SUPERADMIN n'accède pas directement aux données d'un atelier — connectez-vous avec un compte ADMIN de cet atelier.",
      ),
    );
  }
  try {
    const atelier = await prisma.atelier.findUnique({
      where: { id: req.user.atelierId },
      select: { actif: true },
    });
    // atelier introuvable : cas théorique (onDelete: Restrict empêche sa
    // suppression tant qu'un compte y est rattaché) — traité comme suspendu
    // plutôt que de laisser passer par défaut.
    if (!atelier || !atelier.actif) {
      return next(new HttpError(403, "Cet atelier a été suspendu par la plateforme. Contactez le support."));
    }
    next();
  } catch (err) {
    next(err);
  }
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
