// Idempotence des écritures sensibles (sous-phase 3.3, docs/IDEMPOTENCE.md).
//
// En-tête optionnel `Idempotency-Key` (8 à 128 caractères parmi lettres, chiffres, « - _ . : »), fourni par
// le client et conservé tant qu'une MÊME opération logique n'a pas abouti. Sans en-tête : aucun effet.
//
//   même clé + même requête, déjà terminée en 2xx → la réponse d'origine est REJOUÉE (en-tête Idempotent-Replay) ;
//   même clé + requête différente                 → 422 ;
//   même clé pendant le traitement                → 409 « en cours » + Retry-After ;
//   réponse 4xx ou 5xx                            → la réservation est supprimée : le réessai est RÉÉVALUÉ
//                                                   (un refus « solde dépassé » peut devenir faux plus tard) ;
//   clé expirée (24 h) ou traitement abandonné (> 60 s) → reprise comme une nouvelle requête.
//
// La réponse est enregistrée AVANT d'être envoyée : un réessai ne peut jamais voir « en cours » une
// opération déjà terminée dont le client a reçu la réponse.
import crypto from "node:crypto";
import { prisma } from "./prisma.js";
import { log, messageErreur } from "./logger.js";
import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../middlewares/error.middleware.js";
import { isUniqueConstraintViolation } from "./prismaErrors.js";

export const DUREE_VIE_MS = 24 * 60 * 60 * 1000;
export const DELAI_ABANDON_MS = 60_000;
const FORMAT_CLE = /^[A-Za-z0-9_.:-]{8,128}$/;
const TENTATIVES_MAX = 4;

// JSON canonique : l'ordre des clés ne change pas l'empreinte.
function stable(valeur) {
  if (Array.isArray(valeur)) return `[${valeur.map(stable).join(",")}]`;
  if (valeur && typeof valeur === "object") {
    return `{${Object.keys(valeur)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(valeur[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(valeur) ?? "null";
}

export function calculerEmpreinte(methode, chemin, corps) {
  return crypto.createHash("sha256").update(`${methode} ${chemin}\n${stable(corps ?? {})}`).digest("hex");
}

function normaliser(corps) {
  if (corps === undefined || corps === null) return Prisma.JsonNull;
  // Même sérialisation que res.json : les Decimal deviennent des chaînes, les dates des ISO.
  return JSON.parse(JSON.stringify(corps));
}

function journaliserEchec(err) {
  log.error("erreur", { categorie: "idempotence", message: messageErreur(err) });
}

/**
 * Installe la mémorisation sur `res.json` : une réponse 2xx est enregistrée (statut + corps) puis envoyée ;
 * toute autre réponse supprime la réservation puis est envoyée. Un échec d'écriture est journalisé mais ne
 * bloque jamais la réponse.
 */
function executer(res, next, portee, cle) {
  const jsonOrigine = res.json.bind(res);
  let termine = false;
  res.json = (corps) => {
    if (termine) return jsonOrigine(corps);
    termine = true;
    const statut = res.statusCode;
    const ou = { portee, cle, statut: "EN_COURS" };
    const travail =
      statut >= 200 && statut < 300
        ? prisma.cleIdempotence.updateMany({ where: ou, data: { statut: "TERMINEE", reponseStatut: statut, reponseCorps: normaliser(corps) } })
        : prisma.cleIdempotence.deleteMany({ where: ou });
    travail.catch(journaliserEchec).finally(() => jsonOrigine(corps));
    return res;
  };
  next();
}

/** Middleware à placer APRÈS l'authentification et l'analyse du corps, sur une route d'écriture. */
export async function idempotence(req, res, next) {
  const brute = req.get("Idempotency-Key");
  if (brute === undefined) return next();
  if (!FORMAT_CLE.test(brute)) {
    throw new HttpError(400, "En-tête Idempotency-Key invalide : 8 à 128 caractères parmi lettres, chiffres, « - _ . : ».");
  }
  const cle = brute;
  const portee = req.user?.role === "SUPERADMIN" ? `superadmin:${req.user.id}` : `atelier:${req.user.atelierId}`;
  const methode = req.method;
  const chemin = String(req.originalUrl).split("?")[0];
  const empreinte = calculerEmpreinte(methode, chemin, req.body);
  const identifiant = { portee_cle: { portee, cle } };

  for (let essai = 0; essai < TENTATIVES_MAX; essai++) {
    // 1. Réservation atomique (contrainte UNIQUE portee + cle) : une seule requête la remporte.
    try {
      await prisma.cleIdempotence.create({
        data: { portee, cle, methode, chemin, empreinte, statut: "EN_COURS", expireLe: new Date(Date.now() + DUREE_VIE_MS) },
      });
      return executer(res, next, portee, cle);
    } catch (err) {
      if (!isUniqueConstraintViolation(err, "portee")) throw err;
    }

    // 2. La clé existe déjà.
    const existante = await prisma.cleIdempotence.findUnique({ where: identifiant });
    if (!existante) continue; // supprimée entre-temps (échec de la requête précédente) : on retente la réservation

    if (existante.methode !== methode || existante.chemin !== chemin || existante.empreinte !== empreinte) {
      throw new HttpError(422, "Cette clé d'idempotence a déjà été utilisée avec une requête différente.");
    }

    const maintenant = Date.now();
    if (existante.expireLe.getTime() <= maintenant) {
      const pris = await prisma.cleIdempotence.updateMany({
        where: { id: existante.id, expireLe: { lte: new Date() } },
        data: { statut: "EN_COURS", createdAt: new Date(), expireLe: new Date(Date.now() + DUREE_VIE_MS), reponseStatut: null, reponseCorps: Prisma.DbNull },
      });
      if (pris.count === 1) return executer(res, next, portee, cle);
      continue;
    }

    if (existante.statut === "TERMINEE") {
      res.setHeader("Idempotent-Replay", "true");
      return res.status(existante.reponseStatut).json(existante.reponseCorps);
    }

    // EN_COURS : en traitement par une autre requête, ou abandonné (plantage) depuis plus de 60 s.
    if (maintenant - existante.createdAt.getTime() > DELAI_ABANDON_MS) {
      const repris = await prisma.cleIdempotence.updateMany({
        where: { id: existante.id, statut: "EN_COURS", createdAt: { lt: new Date(maintenant - DELAI_ABANDON_MS) } },
        data: { createdAt: new Date() },
      });
      if (repris.count === 1) return executer(res, next, portee, cle);
      continue;
    }
    res.setHeader("Retry-After", "1");
    throw new HttpError(409, "Une requête identique est déjà en cours de traitement. Réessayez dans un instant.");
  }
  throw new HttpError(409, "Conflit d'idempotence : réessayez dans un instant.");
}

/** Supprime les clés expirées (durée de vie dépassée). Appelée chaque jour par le cron. */
export async function purgerClesIdempotence(now = new Date()) {
  const { count } = await prisma.cleIdempotence.deleteMany({ where: { expireLe: { lt: now } } });
  return count;
}
