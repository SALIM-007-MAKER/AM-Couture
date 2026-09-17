import jwt from "jsonwebtoken";
import { HttpError } from "../middlewares/error.middleware.js";

// Le secret vient exclusivement de l'environnement — jamais de valeur en dur.
// Échec rapide et explicite au démarrage plutôt qu'un dysfonctionnement
// silencieux si la variable est absente.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET est manquant dans les variables d'environnement.");
}

// Durée alignée sur celle du cookie (voir authCookie.js).
const EXPIRES_IN = "7d";

// role/atelierId (Phase 8, multi-tenant) embarqués dans le token — évite une
// requête DB supplémentaire à chaque requête juste pour savoir de quel
// atelier relève l'utilisateur. atelierId est `null` pour un SUPERADMIN.
// sessionVersion : revérifié contre la valeur courante en base à chaque
// requête (voir requireAuth, auth.middleware.js) — permet de révoquer un
// jeton avant son expiration naturelle (7 jours) en incrémentant cette
// valeur, sans quoi un JWT reste valide par construction jusqu'à expiration
// quoi qu'il arrive côté base (voir décision : changement de mot de passe).
// impersonatedBy (§ SUPERADMIN "se connecter en tant que", voir
// atelierProvisioning.js:demarrerImpersonation) : id du SUPERADMIN à
// l'origine du jeton quand il s'agit d'une session d'impersonation, absent
// sinon. Permet à POST /auth/quitter-impersonation de retrouver et
// re-signer un jeton pour le SUPERADMIN d'origine sans jamais avoir eu
// besoin de conserver son ancien cookie (le jeton d'impersonation porte
// lui-même la trace du retour).
// clienteId (§ plan rôle USER, Phase 3) : présent UNIQUEMENT pour un compte
// USER — signé une fois pour toutes ici, jamais fourni par le frontend.
// Narrowing indispensable : contrairement à atelierId (suffisant pour un
// ADMIN, qui voit toutes les données de SON atelier), un USER doit être
// filtré par clienteId sur CHAQUE route /api/moi/*, sans quoi il verrait les
// autres clients de son propre atelier (voir requireClient, auth.middleware.js).
export function signAuthToken(user, { impersonatedBy } = {}) {
  return jwt.sign(
    {
      sub: user.id,
      identifiant: user.identifiant,
      role: user.role,
      atelierId: user.atelierId,
      sessionVersion: user.sessionVersion,
      ...(user.clienteId ? { clienteId: user.clienteId } : {}),
      ...(impersonatedBy ? { impersonatedBy } : {}),
    },
    JWT_SECRET,
    { expiresIn: EXPIRES_IN },
  );
}

export function verifyAuthToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    throw new HttpError(401, "Session invalide ou expirée.");
  }
}
