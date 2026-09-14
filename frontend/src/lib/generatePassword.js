// Génère un mot de passe temporaire lisible (pas de caractères ambigus type
// 0/O, 1/l/I) — utilisé UNIQUEMENT pour la réinitialisation par le SUPERADMIN
// (voir AtelierDetailPage.jsx) : un point de départ pratique que le SUPERADMIN
// peut garder tel quel ou modifier avant de l'envoyer au propriétaire de
// l'atelier. `crypto.getRandomValues` (Web Crypto, disponible nativement
// dans tous les navigateurs ciblés) plutôt que `Math.random()` — pas une
// exigence de sécurité forte ici (mot de passe temporaire, changé dès la
// première vraie connexion si l'atelier le souhaite), mais aucune raison de
// préférer un générateur plus faible.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generatePassword(length = 12) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
