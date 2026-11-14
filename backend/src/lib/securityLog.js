import { prisma } from "./prisma.js";

// Journal des événements de sécurité : écrit (1) sur la sortie standard, en JSON
// (logs Vercel) ET (2) en base (table JournalSecurite, conservation limitée —
// voir RETENTION_JOURS). Ne contient JAMAIS de mot de passe, jeton, cookie,
// identifiant saisi ni corps de requête.
//
// Événements : LOGIN_ECHEC, LOGIN_OK, MOT_DE_PASSE_CHANGE, MOT_DE_PASSE_REINITIALISE,
// MOT_DE_PASSE_REINITIALISE_PAR_SUPERADMIN, IMPERSONATION_DEBUT, IMPERSONATION_FIN,
// ATELIER_SUSPENDU, ATELIER_REACTIVE, RATE_LIMIT.

export const RETENTION_JOURS = Number(process.env.RETENTION_JOURNAL_SECURITE_JOURS) || 365;

// Liste BLANCHE des clés autorisées dans `details` : une clé inconnue est
// ignorée plutôt qu'enregistrée, pour qu'un futur appel distrait ne puisse pas
// y glisser une donnée sensible. Valeurs limitées à des scalaires courts.
const CLES_AUTORISEES = new Set(["compteId", "prefixe"]);
const LONGUEUR_MAX = 100;

export function assainirDetails(details) {
  if (!details || typeof details !== "object") return null;
  const propre = {};
  for (const [cle, valeur] of Object.entries(details)) {
    if (!CLES_AUTORISEES.has(cle)) continue;
    if (typeof valeur === "string") propre[cle] = valeur.slice(0, LONGUEUR_MAX);
    else if (typeof valeur === "number" || typeof valeur === "boolean") propre[cle] = valeur;
  }
  return Object.keys(propre).length > 0 ? propre : null;
}

/**
 * À appeler avec `await` (piège serverless déjà rencontré dans ce projet : une
 * promesse non attendue peut être suspendue avant d'aboutir). Ne lance JAMAIS
 * d'exception : un échec d'écriture du journal ne doit pas faire échouer l'action
 * qu'il décrit — il est signalé en log standard.
 */
export async function journaliserSecurite(evenement, { req, userId, atelierId, details } = {}) {
  const ip = req?.ip ?? null;
  const detailsPropres = assainirDetails(details);
  console.warn(
    JSON.stringify({
      type: "securite",
      evenement,
      date: new Date().toISOString(),
      ...(userId ? { userId } : {}),
      ...(atelierId ? { atelierId } : {}),
      ...(ip ? { ip } : {}),
      ...(detailsPropres ? { details: detailsPropres } : {}),
    }),
  );
  try {
    await prisma.journalSecurite.create({
      data: { evenement, userId: userId ?? null, atelierId: atelierId ?? null, ip, details: detailsPropres ?? undefined },
    });
  } catch (err) {
    console.error(`[securityLog] Écriture en base impossible (${evenement}) : ${err.message}`);
  }
}

/** Supprime les entrées plus anciennes que la durée de conservation. */
export async function purgerJournalSecurite(now = new Date()) {
  const limite = new Date(now.getTime() - RETENTION_JOURS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.journalSecurite.deleteMany({ where: { createdAt: { lt: limite } } });
  return count;
}
