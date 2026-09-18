import { verifyAuthToken } from "../lib/jwt.js";
import { COOKIE_NAME } from "../lib/authCookie.js";
import { HttpError } from "./error.middleware.js";
import { prisma } from "../lib/prisma.js";
import { essaiExpire } from "../lib/trial.js";
import { statutEffectif } from "../lib/abonnement.js";

/**
 * Protège une route : exige un cookie de session valide.
 * Attache req.user = { id, identifiant, role, atelierId, impersonatedBy }
 * (jamais passwordHash). role/atelierId (Phase 8) et impersonatedBy (§
 * SUPERADMIN "se connecter en tant que") viennent directement du JWT — voir
 * lib/jwt.js.
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
    req.user = {
      id: payload.sub,
      identifiant: payload.identifiant,
      role: payload.role,
      atelierId: payload.atelierId,
      // Présent uniquement pour une session d'impersonation SUPERADMIN (voir
      // lib/jwt.js) — permet à /auth/quitter-impersonation de retrouver le
      // compte SUPERADMIN d'origine.
      impersonatedBy: payload.impersonatedBy ?? null,
      // Présent UNIQUEMENT pour un compte USER (§ plan rôle client, voir
      // requireClient ci-dessous) — jamais pour ADMIN/SUPERADMIN.
      clienteId: payload.clienteId ?? null,
    };
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
 * directement sur les données d'un atelier avec SON PROPRE jeton — il gère
 * la plateforme (voir ateliers.routes.js) et peut démarrer une impersonation
 * (POST /ateliers/:id/comptes/:userId/impersonation) pour agir "en tant que"
 * le compte ADMIN de tel ou tel atelier, avec le jeton de CE compte.
 *
 * Vérifie EXPLICITEMENT `role === "ADMIN"`, pas seulement la présence
 * d'atelierId : depuis l'introduction du rôle USER (§ plan rôle client,
 * Phase 3), un compte USER a LUI AUSSI un atelierId (celui de l'atelier dont
 * il est client) — un simple test de présence laisserait un USER passer et
 * accéder à toutes les routes ADMIN. USER doit passer par requireClient
 * (routes /api/moi/*), jamais par ici.
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
  if (req.user?.role !== "ADMIN" || !req.user?.atelierId) {
    return next(
      new HttpError(
        403,
        "Réservé aux comptes ADMIN d'un atelier.",
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
 * À utiliser APRÈS requireAtelier sur les routes métier "normales" d'un
 * atelier (Clientes, Commandes, Modèles, Paiements, Dépenses, Stock, Reçus,
 * Dashboard, Rapports, Notifications, Paramètres) — § essai gratuit /
 * abonnement (plan trial). Bloque avec 402 si l'essai de 15 jours est
 * expiré ET qu'aucun abonnement n'est actuellement ACTIF (voir
 * lib/abonnement.js:statutEffectif).
 *
 * DÉLIBÉRÉMENT PAS appliquée sur : /api/abonnements (l'atelier doit pouvoir
 * consulter/souscrire pour sortir du blocage), /api/transactions
 * (confirmation d'un paiement manuel NITA/Amana — même raison),
 * /api/plans-abonnement (pas de requireAtelier de toute façon),
 * /api/compte (gestion du compte de connexion lui-même).
 *
 * Bypass SUPERADMIN : si la session est une impersonation
 * (`req.user.impersonatedBy` posé, voir lib/jwt.js), le blocage ne
 * s'applique jamais — la plateforme doit toujours pouvoir superviser un
 * atelier, y compris hors essai/abonnement.
 */
export async function requireAbonnementActif(req, res, next) {
  if (req.user.impersonatedBy) return next();

  try {
    const [atelier, abonnementsConfirmes] = await Promise.all([
      prisma.atelier.findUnique({ where: { id: req.user.atelierId }, select: { trialEndsAt: true } }),
      // TOUS les abonnements confirmés, pas seulement le dernier créé : un
      // abonnement planifié (début futur) ou un ancien abonnement annulé ne
      // doit jamais masquer un abonnement réellement actif.
      prisma.abonnement.findMany({
        where: { atelierId: req.user.atelierId, statut: "CONFIRME" },
        select: { statut: true, dateDebut: true, dateExpiration: true },
      }),
    ]);

    if (!essaiExpire(atelier)) return next();
    if (abonnementsConfirmes.some((a) => statutEffectif(a) === "ACTIF")) return next();

    return next(
      new HttpError(402, "Votre période d'essai est terminée. Souscrivez à un abonnement pour continuer.", {
        essaiExpire: true,
      }),
    );
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

/**
 * À utiliser APRÈS requireAuth sur les routes du client final (§ plan rôle
 * USER — voir routes/moi.routes.js, montées sous /api/moi). Exige un compte
 * USER avec un clienteId valide dans le jeton.
 *
 * RÈGLE ABSOLUE pour tout ce qui est monté derrière ce middleware : filtrer
 * TOUJOURS par `req.user.clienteId`, JAMAIS par `req.user.atelierId` seul —
 * contrairement à un ADMIN (scopé par atelier, qui voit légitimement TOUTES
 * les données de son atelier), un USER ne doit voir QUE ses propres données,
 * même au sein du même atelier. `atelierId` reste disponible pour les
 * quelques écritures qui en ont besoin (ex: créer une DemandeCommande), mais
 * ne doit jamais servir de filtre de LECTURE à lui seul ici.
 *
 * Délibérément AUCUN requireAbonnementActif sur ces routes : un client final
 * consultant ses propres commandes ne doit jamais être bloqué parce que SON
 * atelier n'a pas payé son abonnement plateforme — hors de son contrôle.
 */
export function requireClient(req, res, next) {
  if (req.user?.role !== "USER" || !req.user.clienteId) {
    return next(new HttpError(403, "Réservé aux comptes clients."));
  }
  next();
}
