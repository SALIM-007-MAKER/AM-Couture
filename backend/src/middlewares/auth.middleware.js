import { verifyAuthToken } from "../lib/jwt.js";
import { COOKIE_NAME } from "../lib/authCookie.js";
import { HttpError } from "./error.middleware.js";
import { prisma } from "../lib/prisma.js";
import { essaiExpire } from "../lib/trial.js";
import { aPermission, permissionPourMethode } from "../lib/permissions.js";
import { etatAbonnementAtelier, modeAcces } from "../lib/abonnement.js";

// Jours de grâce appliqués si la plateforme n'a rien configuré (ParametresPlateforme.joursGrace vaut 7 par défaut).
const JOURS_GRACE_PAR_DEFAUT = 7;
const METHODES_LECTURE = new Set(["GET", "HEAD", "OPTIONS"]);

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
    // Une seule lecture : version de session, rôle, état actif et permissions. Un compte désactivé, un rôle qui ne
    // correspond plus au jeton ou une version de session périmée coupent la session IMMÉDIATEMENT, quelle que soit la
    // durée de vie restante du jeton.
    const compte = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { sessionVersion: true, actif: true, role: true, permissions: true, langue: true },
    });
    if (!compte || compte.sessionVersion !== payload.sessionVersion || compte.role !== payload.role) {
      return next(new HttpError(401, "Session expirée — reconnectez-vous."));
    }
    if (!compte.actif) {
      return next(new HttpError(401, "Ce compte a été désactivé. Contactez le responsable de l'atelier."));
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
      // Langue des textes produits par le serveur pour cette personne (fil d'activité, PDF…) — voir lib/messagesServeur.js.
      langue: compte.langue,
      // Présent UNIQUEMENT pour un compte USER (§ plan rôle client, voir
      // requireClient ci-dessous) — jamais pour ADMIN/SUPERADMIN.
      clienteId: payload.clienteId ?? null,
      // Employés : permissions accordées par le PDG, lues en base à CETTE requête (jamais dans le jeton).
      permissions: compte.permissions ?? [],
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
/** Vérifie que l'atelier du compte existe et n'est pas suspendu ; pose l'échéance d'essai pour requireAbonnementActif. */
async function verifierAtelierActif(req, next) {
  try {
    const atelier = await prisma.atelier.findUnique({
      where: { id: req.user.atelierId },
      // trialEndsAt lu ici en même temps que `actif` : requireAbonnementActif (juste après) en a besoin, ce qui
      // lui évite une seconde lecture de la même ligne (un aller-retour de moins par requête authentifiée).
      select: { actif: true, trialEndsAt: true },
    });
    // atelier introuvable : cas théorique (onDelete: Restrict empêche sa suppression tant qu'un compte y est
    // rattaché) — traité comme suspendu plutôt que de laisser passer par défaut.
    if (!atelier || !atelier.actif) {
      return next(new HttpError(403, "Cet atelier a été suspendu par la plateforme. Contactez le support."));
    }
    req.atelierEssai = { trialEndsAt: atelier.trialEndsAt };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * ADMINISTRATION de l'atelier : réservé au PDG (compte ADMIN). Employés, paramètres, abonnement et ses paiements ne
 * sont jamais délégables : un employé reçoit toujours 403 ici, quelles que soient ses permissions.
 *
 * Vérifie EXPLICITEMENT `role === "ADMIN"`, pas seulement la présence d'atelierId : un compte USER (cliente) ou
 * EMPLOYE a LUI AUSSI un atelierId. Vérifie aussi que l'atelier n'est pas suspendu, EN BASE, à chaque requête : une
 * suspension décidée par le SUPERADMIN prend effet immédiatement, même pour une session déjà ouverte.
 */
export async function requireAtelier(req, res, next) {
  if (req.user?.role !== "ADMIN" || !req.user?.atelierId) {
    return next(
      new HttpError(
        403,
        req.user?.role === "EMPLOYE"
          ? "Réservé au responsable de l'atelier (PDG)."
          : "Réservé aux comptes ADMIN d'un atelier.",
      ),
    );
  }
  return verifierAtelierActif(req, next);
}

/**
 * FONCTIONS MÉTIER de l'atelier : le PDG (ADMIN) ou un employé (EMPLOYE). Ne vérifie QUE l'appartenance à un atelier
 * actif ; ce qu'un employé a le droit de faire est contrôlé ensuite, route par route, par requirePermission /
 * droitsParModule. À lui seul, ce middleware ne donne aucun accès à un employé sans permission.
 */
export async function requireMembreAtelier(req, res, next) {
  const role = req.user?.role;
  if ((role !== "ADMIN" && role !== "EMPLOYE") || !req.user?.atelierId) {
    return next(new HttpError(403, "Réservé aux comptes d'un atelier."));
  }
  return verifierAtelierActif(req, next);
}

/** Exige une permission précise (le PDG les a toutes). 403 sinon, sans révéler d'information sur la ressource. */
export function requirePermission(permission) {
  return function controlePermission(req, res, next) {
    if (aPermission(req.user, permission)) return next();
    return next(new HttpError(403, "Vous n'avez pas l'autorisation d'effectuer cette action.", { permission }));
  };
}

/** Exige au moins UNE des permissions données. */
export function requireUnePermission(...permissions) {
  return function controlePermissions(req, res, next) {
    if (permissions.some((p) => aPermission(req.user, p))) return next();
    return next(new HttpError(403, "Vous n'avez pas l'autorisation d'effectuer cette action.", { permission: permissions[0] }));
  };
}

/** Lecture (GET) ou écriture (autres méthodes) d'un module : `<module>.lire` ou `<module>.ecrire`. */
export function droitsParModule(module) {
  return function controleModule(req, res, next) {
    return requirePermission(permissionPourMethode(module, req.method))(req, res, next);
  };
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
    // Échéance d'essai déjà lue par requireAtelier ; relue seulement si ce middleware est utilisé seul.
    const atelier =
      req.atelierEssai ??
      (await prisma.atelier.findUnique({ where: { id: req.user.atelierId }, select: { trialEndsAt: true } }));

    // Chemin courant, sans requête supplémentaire : essai en cours, ou atelier ancien sans échéance d'essai.
    if (!atelier?.trialEndsAt || !essaiExpire(atelier)) return next();

    // Essai terminé : l'état d'abonnement et le délai de grâce décident (voir lib/abonnement.js, modeAcces).
    const [abonnements, plateforme] = await Promise.all([
      prisma.abonnement.findMany({
        where: { atelierId: req.user.atelierId, statut: { in: ["CONFIRME", "SUSPENDU"] } },
        select: { statut: true, dateDebut: true, dateExpiration: true },
      }),
      prisma.parametresPlateforme.findUnique({ where: { id: "plateforme" }, select: { joursGrace: true } }),
    ]);
    const etat = etatAbonnementAtelier(atelier, abonnements);
    const { mode } = modeAcces(etat, abonnements, { joursGrace: plateforme?.joursGrace ?? JOURS_GRACE_PAR_DEFAUT });

    // Accès complet (abonnement actif) ou période de grâce : tout fonctionne, l'interface affiche un avertissement.
    if (mode !== "LECTURE_SEULE") return next();

    // LECTURE SEULE : l'atelier consulte et exporte ses données, il n'en crée ni n'en modifie plus. Aucune donnée
    // n'est masquée ni supprimée. Seules exceptions d'écriture : l'état « lu » des notifications (aucune donnée
    // métier) ; la souscription et le compte ne passent pas par ce middleware.
    if (METHODES_LECTURE.has(req.method) || req.baseUrl === "/api/notifications") return next();

    return next(
      new HttpError(
        402,
        "Votre abonnement est terminé : votre atelier est en lecture seule. Vos données restent consultables et exportables. Souscrivez à un abonnement pour reprendre la saisie.",
        { essaiExpire: true, lectureSeule: true },
      ),
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
