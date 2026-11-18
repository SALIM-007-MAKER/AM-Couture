import { log, messageErreur } from "./logger.js";
import crypto from "node:crypto";
import { prisma } from "./prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { journaliserSecurite } from "./securityLog.js";

// Rate-limiting persistant (Postgres) — voir LimiteTaux, schema.prisma, pour
// le pourquoi (express-rate-limit en mémoire ne suffit pas en serverless).

// Purge opportuniste plutôt qu'un job dédié : 2% de chance par appel de
// supprimer les lignes de plus de 24h — largement suffisant pour empêcher
// une croissance illimitée vu le volume attendu (une poignée de routes
// sensibles, jamais un trafic massif).
async function nettoyageOpportuniste() {
  if (Math.random() > 0.02) return;
  const hier = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.limiteTaux.deleteMany({ where: { updatedAt: { lt: hier } } }).catch(() => {});
}

/**
 * Incrémente ATOMIQUEMENT (un seul UPSERT SQL — pas de lecture puis
 * écriture séparées, qui laisserait une fenêtre de course entre deux
 * requêtes concurrentes) le compteur associé à `cle`, et renvoie le compte
 * après incrément. Fenêtre FIXE (pas glissante) : à l'expiration, le
 * compteur repart de 1 plutôt que de décroître progressivement — plus
 * simple, suffisant pour de l'anti-abus (pas une garantie de facturation).
 */
async function incrementer(cle, fenetreMs) {
  const id = crypto.randomUUID();
  const rows = await prisma.$queryRaw`
    INSERT INTO "LimiteTaux" (id, cle, "fenetreDebut", compte, "updatedAt")
    VALUES (${id}, ${cle}, now(), 1, now())
    ON CONFLICT (cle) DO UPDATE SET
      compte = CASE
        WHEN "LimiteTaux"."fenetreDebut" < now() - (${fenetreMs}::text || ' milliseconds')::interval THEN 1
        ELSE "LimiteTaux".compte + 1
      END,
      "fenetreDebut" = CASE
        WHEN "LimiteTaux"."fenetreDebut" < now() - (${fenetreMs}::text || ' milliseconds')::interval THEN now()
        ELSE "LimiteTaux"."fenetreDebut"
      END,
      "updatedAt" = now()
    RETURNING compte;
  `;
  return rows[0].compte;
}

/**
 * Middleware Express — remplace directement un `rateLimit({...})`
 * d'express-rate-limit. `prefixe` distingue les compteurs entre routes
 * (ex: "login", "inscription") ; la clé finale inclut l'IP du client.
 *
 * Échoue "ouvert" (laisse passer) si la table elle-même est indisponible
 * (panne Postgres ponctuelle, pic de charge...) — un mécanisme anti-abus
 * annexe ne doit jamais transformer un incident secondaire en panne totale
 * du login/de l'inscription pour tout le monde.
 */
export function rateLimitPersistant({ prefixe, limite, fenetreMs, message = "Trop de tentatives. Réessayez plus tard." }) {
  return async (req, res, next) => {
    try {
      await nettoyageOpportuniste();
      const cle = `${prefixe}:${req.ip}`;
      const compte = await incrementer(cle, fenetreMs);
      if (compte > limite) {
        // Une seule ligne de log au franchissement du seuil (pas à chaque requête bloquée).
        if (compte === limite + 1) await journaliserSecurite("RATE_LIMIT", { req, details: { prefixe } });
        return next(new HttpError(429, message));
      }
      next();
    } catch (err) {
      log.error("erreur", { categorie: "rate_limit", prefixe, message: messageErreur(err), consequence: "requete_laissee_passer" });
      next();
    }
  };
}

/** Limite de tentatives de connexion par fenêtre : relevée en développement local seulement (liste d'autorisation stricte). */
export const LIMITE_CONNEXION = 10;
export const LIMITE_CONNEXION_LOCALE = 500;
export function limiteConnexion(env = process.env) {
  return env.NODE_ENV === "development" && !env.VERCEL ? LIMITE_CONNEXION_LOCALE : LIMITE_CONNEXION;
}
