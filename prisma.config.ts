import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// La CLI Prisma (migrate, studio, db push, seed) utilise cette config.
// Le runtime applicatif (backend/src/lib/prisma.js) n'y touche pas : il
// construit son propre adapter avec DATABASE_URL (connexion poolée Neon).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Connexion DIRECTE (non poolée) : indispensable pour les migrations,
    // la connexion poolée (pgbouncer) casse les prepared statements de Prisma Migrate.
    url: env("DIRECT_URL"),
  },
});
