import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 : plus de moteur Rust, un driver adapter est obligatoire.
// On utilise systématiquement la connexion POOLÉE Neon (DATABASE_URL) ici —
// jamais DIRECT_URL, réservée aux migrations (voir prisma.config.ts).
//
// Singleton via globalThis : indispensable en environnement serverless
// (Vercel Fluid Compute réutilise l'instance de fonction entre invocations
// "chaudes" — sans singleton, chaque requête recréerait une connexion).

const globalForPrisma = globalThis;

function entierPositif(valeur, parDefaut) {
  const n = Number(valeur);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : parDefaut;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL est manquant dans les variables d'environnement.");
  }
  // max: le pool pg par défaut (10) s'est révélé trop court sous charge
  // concurrente réelle (voir tests de concurrence du module Commandes —
  // création de numéro atomique) : 15 requêtes simultanées suffisaient à
  // saturer le pool et à expirer des transactions interactives Prisma
  // (défaut 5s) en attente d'une connexion. La connexion Neon "-pooler"
  // (DATABASE_URL) est conçue pour multiplexer un nombre de clients bien
  // supérieur à 10 — augmenter ce pool applicatif est donc sûr.
  // Délais explicites : sans eux, une base qui ne répond pas laisse chaque requête suspendue
  // jusqu'à l'arrêt de la fonction par la plateforme (mesuré : plus de 8 s sans aucune réponse).
  // Uniquement des délais CÔTÉ CLIENT (aucun paramètre de session envoyé au serveur) : compatibles
  // avec un pooler de type pgbouncer, qui peut refuser certains paramètres de démarrage (non vérifié
  // sur le pooler Neon : aucun accès à Neon pendant ce développement — à confirmer au premier déploiement).
  //  - connexion (4 s par défaut) : une cible injoignable échoue vite (503 propre, voir
  //    classifierErreur.js). Une route qui fait deux accès successifs (limiteur de débit puis
  //    requête métier) attend jusqu'à 2 × ce délai : 4 s garde le pire cas sous ~8 s ;
  //  - requête : une requête bloquée ne retient pas indéfiniment une connexion du pool ;
  //  - inactivité : les connexions oisives sont rendues rapidement (serverless).
  const adapter = new PrismaPg({
    connectionString,
    max: 20,
    connectionTimeoutMillis: entierPositif(process.env.DB_CONNECT_TIMEOUT_MS, 4000),
    query_timeout: entierPositif(process.env.DB_QUERY_TIMEOUT_MS, 25000),
    idleTimeoutMillis: entierPositif(process.env.DB_IDLE_TIMEOUT_MS, 10000),
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.__amCouturePrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__amCouturePrisma = prisma;
}
