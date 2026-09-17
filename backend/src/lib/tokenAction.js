import crypto from "node:crypto";
import { prisma } from "./prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";

// Jetons à usage unique (vérification d'email, réinitialisation de mot de
// passe) — voir TokenAction, schema.prisma. 32 octets aléatoires en hex :
// même ordre de grandeur d'entropie que les secrets applicatifs existants
// (référenceInterne des transactions Wave utilise crypto.randomUUID()) —
// largement suffisant pour un jeton non devinable par force brute.
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
    data: { token, type, userId, expireLe: new Date(Date.now() + dureeMs) },
  });
  return token;
}

/**
 * Valide et consomme un jeton (marque `utiliseLe`) — un jeton déjà utilisé
 * ou expiré est traité comme invalide, avec un message volontairement
 * générique (jamais "expiré" vs "déjà utilisé" vs "inexistant" séparément :
 * ne donne aucune information supplémentaire à un attaquant qui devine des
 * jetons). Retourne l'utilisateur associé si valide.
 */
export async function consommerToken({ token, type }) {
  const enregistrement = await prisma.tokenAction.findUnique({ where: { token }, include: { user: true } });
  const invalide =
    !enregistrement ||
    enregistrement.type !== type ||
    enregistrement.utiliseLe !== null ||
    enregistrement.expireLe < new Date();
  if (invalide) {
    throw new HttpError(400, "Ce lien est invalide ou a expiré.");
  }
  await prisma.tokenAction.update({ where: { id: enregistrement.id }, data: { utiliseLe: new Date() } });
  return enregistrement.user;
}
