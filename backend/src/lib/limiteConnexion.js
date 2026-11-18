// Limite de tentatives de connexion par fenêtre de 15 min et par IP. Fonction pure, sans dépendance (testable sans base).
// Relevée en développement local seulement : liste d'autorisation stricte (NODE_ENV exactement « development », hors Vercel).
export const LIMITE_CONNEXION = 10;
export const LIMITE_CONNEXION_LOCALE = 500;

export function limiteConnexion(env = process.env) {
  return env.NODE_ENV === "development" && !env.VERCEL ? LIMITE_CONNEXION_LOCALE : LIMITE_CONNEXION;
}
