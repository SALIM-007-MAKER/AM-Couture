-- Révocation de session sur changement de mot de passe (voir jwt.js,
-- auth.middleware.js). Colonne NOT NULL avec DEFAULT 0 : s'applique
-- directement à toutes les lignes existantes sans backfill séparé (Postgres
-- remplit la valeur par défaut pour les lignes déjà présentes).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;
