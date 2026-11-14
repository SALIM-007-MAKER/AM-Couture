import { HttpError } from "./error.middleware.js";

// En-têtes de sécurité des réponses /api/* (le frontend statique reçoit les
// siens via vercel.json). Implémenté à la main plutôt qu'avec `helmet` : l'API
// ne sert que du JSON/PDF, quelques en-têtes fixes suffisent, une dépendance
// de moins à maintenir.
export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // Une réponse d'API ne doit jamais s'afficher comme une page : rien n'est
  // autorisé à charger ni à se faire encadrer.
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  // Données personnelles et sessions : jamais mises en cache par un proxy ou
  // un navigateur partagé.
  res.setHeader("Cache-Control", "no-store");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

const METHODES_ECRITURE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function hoteDe(valeur) {
  try {
    return new URL(valeur).host;
  } catch {
    return null;
  }
}

/**
 * Défense en profondeur contre le CSRF, EN PLUS de `SameSite=Lax` sur le
 * cookie de session : toute requête d'écriture dont l'en-tête `Origin` (envoyé
 * par tous les navigateurs sur un POST/PUT/PATCH/DELETE) désigne un autre site
 * que celui qui sert l'API est refusée.
 *
 * Une requête SANS `Origin` (curl, tests, anciens clients non navigateurs) est
 * laissée passer : sans navigateur il n'y a pas de cookie ambiant à détourner.
 * En développement, le proxy Vite réécrit déjà Host (changeOrigin) mais pas
 * Origin : les origines localhost sont donc acceptées hors production.
 * `ALLOWED_ORIGINS` (liste séparée par des virgules, hôtes) permet d'ajouter
 * un domaine personnalisé si besoin.
 */
export function csrfOriginGuard(req, res, next) {
  if (!METHODES_ECRITURE.has(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next();

  const hoteOrigine = hoteDe(origin);
  const hoteServi = (req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0].trim();
  const autorises = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ok =
    hoteOrigine !== null &&
    (hoteOrigine === hoteServi ||
      autorises.includes(hoteOrigine) ||
      (process.env.NODE_ENV !== "production" && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(hoteOrigine)));

  if (!ok) return next(new HttpError(403, "Origine de la requête non autorisée."));
  next();
}
