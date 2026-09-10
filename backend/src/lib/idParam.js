import { HttpError } from "../middlewares/error.middleware.js";

/**
 * Middleware Express `router.param()` : rejette un paramètre d'URL
 * manifestement invalide (octet nul, caractères de contrôle, longueur
 * absurde) AVANT qu'il n'atteigne Prisma.
 *
 * Sans ce garde-fou, un octet nul (ex: `/api/commandes/%00`) est refusé par
 * Postgres au niveau du protocole (pas par une contrainte SQL), et cette
 * erreur bas-niveau remonte non transformée jusqu'au middleware d'erreur
 * générique — un 500 générique là où un 400 propre est attendu pour une
 * entrée simplement malformée.
 */
export function requireValidIdParam(req, res, next, value) {
  const isPlausible =
    typeof value === "string" && value.length > 0 && value.length <= 100 && !/[\x00-\x1f]/.test(value);
  if (!isPlausible) {
    return next(new HttpError(400, "Identifiant invalide."));
  }
  next();
}
