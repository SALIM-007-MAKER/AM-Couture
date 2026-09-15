-- Vérification d'email + réinitialisation de mot de passe en libre-service
-- (Resend, voir lib/resend.js). Colonne NULLABLE (aucune ligne existante
-- affectée) + nouvelle table de jetons éphémères, sans rapport avec le
-- reste du schéma métier.

-- CreateEnum
CREATE TYPE "TypeTokenAction" AS ENUM ('VERIFICATION_EMAIL', 'REINITIALISATION_MOT_DE_PASSE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifieLe" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TokenAction" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "type" "TypeTokenAction" NOT NULL,
    "userId" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "utiliseLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenAction_token_key" ON "TokenAction"("token");

-- CreateIndex
CREATE INDEX "TokenAction_userId_idx" ON "TokenAction"("userId");

-- AddForeignKey
ALTER TABLE "TokenAction" ADD CONSTRAINT "TokenAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
