import crypto from "node:crypto";
import { prisma } from "./prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";

// Jetons à usage unique (vérification d'email, réinitialisation de mot de
// passe) — voir TokenAction, schema.prisma. 32 octets aléatoires en hex :
// même ordre de grandeur d'entropie que les secrets applicatifs existants
// (référenceInterne des transactions Wave utilise crypto.randomUUID()) —
// largement suffisant pour un jeton non devinable par force brute.
// Seul le HACHÉ SHA-256 du jeton est stocké : une fuite de la base (sauvegarde,
// export) ne donne alors aucun lien de réinitialisation/activation utilisable.
// Le jeton en clair n'existe que dans l'email envoyé. 256 bits d'entropie
// rendent un sel inutile.
export function hacherToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function genererToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Crée un jeton pour un utilisateur donné, avec une durée de validité en
 * millisecondes. Ne révoque PAS les jetons précédents du même type/utilisateur
 * (plusieurs demandes successives restent toutes valides jusqu'à expiration
 * ou utilisation individuelle) — cohérent avec un usage "j'ai cliqué sur un
 * vieil email par erreur, mais j'ai aussi redemandé un nouveau lien entre
 * temps" : le dernier lien envoyé ne doit pas invalider silencieusement.
 */
export async function creerToken({ userId, type, dureeMs }, client = prisma) {
  const token = genererToken();
  await client.tokenAction.create({
    data: { token: hacherToken(token), type, userId, expireLe: new Date(Date.now() + dureeMs) },
  });
  return token;
}

/**
 * Valide et consomme un jeton (marque `utiliseLe`) — un jeton déjà utilisé
 * ou expiré est traité comme invalide, avec un message volontairement
 * générique (jamais "expiré" vs "déjà utilisé" vs "inexistant" séparément :
 * ne donne aucune information supplémentaire à un attaquant qui devine des
 * jetons). Retourne l'utilisateur associé si valide.
 *
 * Usage unique GARANTI même sous requêtes simultanées : la vérification (type, non utilisé, non expiré) et le marquage
 * « utilisé » sont UNE SEULE instruction SQL (UPDATE ... WHERE). Postgres verrouille la ligne : une requête concurrente
 * réévalue la condition `utiliseLe IS NULL` après le verrou, la voit déjà posée et ne modifie rien. Seule la requête qui
 * modifie exactement une ligne a consommé le jeton. (L'ancienne séquence lecture puis mise à jour laissait passer
 * plusieurs consommations simultanées.)
 */
export async function consommerToken({ token, type }) {
  const hache = hacherToken(token);
  const maintenant = new Date();
  const { count } = await prisma.tokenAction.updateMany({
    where: { token: hache, type, utiliseLe: null, expireLe: { gt: maintenant } },
    data: { utiliseLe: maintenant },
  });
  if (count !== 1) {
    throw new HttpError(400, "Ce lien est invalide ou a expiré.");
  }
  const enregistrement = await prisma.tokenAction.findUnique({ where: { token: hache }, include: { user: true } });
  return enregistrement.user;
}
