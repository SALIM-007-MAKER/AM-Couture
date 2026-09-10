// Cookie de session HttpOnly — inaccessible en JavaScript côté navigateur
// (protection XSS). `secure` n'est activé qu'en production car le dev local
// tourne en HTTP simple. `sameSite: "lax"` suffit : frontend et API sont
// toujours same-origin (voir app.js), aucune requête cross-site n'est
// attendue.
export const COOKIE_NAME = "am_session";

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours, aligné sur l'expiration du JWT (jwt.js)

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: MAX_AGE_MS });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}
