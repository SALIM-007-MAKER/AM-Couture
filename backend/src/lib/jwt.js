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
export function signAuthToken(user) {
  return jwt.sign(
    { sub: user.id, identifiant: user.identifiant, role: user.role, atelierId: user.atelierId },
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
