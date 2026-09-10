import { verifyAuthToken } from "../lib/jwt.js";
import { COOKIE_NAME } from "../lib/authCookie.js";
import { HttpError } from "./error.middleware.js";

/**
 * Protège une route : exige un cookie de session valide.
 * Attache req.user = { id, identifiant } (jamais passwordHash).
 */
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return next(new HttpError(401, "Authentification requise."));
  }
  try {
    const payload = verifyAuthToken(token);
    req.user = { id: payload.sub, identifiant: payload.identifiant };
    next();
  } catch (err) {
    next(err);
  }
}
