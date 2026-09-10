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
  const adapter = new PrismaPg({ connectionString, max: 20 });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.__amCouturePrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__amCouturePrisma = prisma;
}
