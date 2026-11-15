import { z } from "zod";

// bcrypt ne lit que les 72 PREMIERS OCTETS d'un mot de passe : au-delà, deux
// mots de passe différents donnent le même hash. On refuse donc plutôt que de
// tronquer silencieusement.
export const MOT_DE_PASSE_MAX_OCTETS = 72;

// Mots de passe les plus utilisés (comparaison insensible à la casse). Liste
// volontairement courte : elle écarte les choix triviaux sans imposer de
// règle de composition arbitraire.
const COURANTS = new Set([
  "12345678", "123456789", "1234567890", "password", "password1", "password123",
  "motdepasse", "motdepasse1", "azertyuiop", "azerty123", "qwertyuiop", "qwerty123",
  "11111111", "00000000", "abcd1234", "iloveyou", "admin123", "bienvenue", "atelier123", "couture123",
]);

export function estMotDePasseCourant(valeur) {
  return COURANTS.has(valeur.toLowerCase());
}

/** Champ Zod « nouveau mot de passe » : 8 caractères min, 72 octets max, pas un mot de passe courant. */
export const nouveauMotDePasseField = z
  .string()
  .min(8, "8 caractères minimum.")
  .refine((v) => Buffer.byteLength(v, "utf8") <= MOT_DE_PASSE_MAX_OCTETS, "72 octets maximum.")
  .refine((v) => !estMotDePasseCourant(v), "Ce mot de passe est trop courant, choisissez-en un autre.");
