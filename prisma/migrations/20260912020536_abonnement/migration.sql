-- CreateEnum
CREATE TYPE "StatutAbonnement" AS ENUM ('EN_ATTENTE', 'CONFIRME', 'ANNULE');

-- CreateEnum
CREATE TYPE "MoyenPaiement" AS ENUM ('WAVE', 'NITA', 'AMANA');

-- CreateEnum
CREATE TYPE "StatutTransaction" AS ENUM ('EN_ATTENTE', 'REUSSIE', 'ECHOUEE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "langue" TEXT NOT NULL DEFAULT 'fr';

-- CreateTable
CREATE TABLE "FormuleAbonnement" (
    "id" TEXT NOT NULL,
    "dureeMois" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "prix" DECIMAL(10,2) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormuleAbonnement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Abonnement" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "formuleId" TEXT NOT NULL,
    "prix" DECIMAL(10,2) NOT NULL,
    "dateDebut" TIMESTAMP(3),
    "dateExpiration" TIMESTAMP(3),
    "statut" "StatutAbonnement" NOT NULL DEFAULT 'EN_ATTENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Abonnement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "abonnementId" TEXT NOT NULL,
    "moyenPaiement" "MoyenPaiement" NOT NULL,
    "montant" DECIMAL(10,2) NOT NULL,
    "statut" "StatutTransaction" NOT NULL DEFAULT 'EN_ATTENTE',
    "referenceInterne" TEXT NOT NULL,
    "referenceExterne" TEXT,
    "confirmeManuellement" BOOLEAN NOT NULL DEFAULT false,
    "donneesBrutesWebhook" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormuleAbonnement_dureeMois_key" ON "FormuleAbonnement"("dureeMois");

-- CreateIndex
CREATE UNIQUE INDEX "Abonnement_numero_key" ON "Abonnement"("numero");

-- CreateIndex
CREATE INDEX "Abonnement_statut_idx" ON "Abonnement"("statut");

-- CreateIndex
CREATE INDEX "Abonnement_formuleId_idx" ON "Abonnement"("formuleId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_numero_key" ON "Transaction"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_referenceInterne_key" ON "Transaction"("referenceInterne");

-- CreateIndex
CREATE INDEX "Transaction_abonnementId_idx" ON "Transaction"("abonnementId");

-- AddForeignKey
ALTER TABLE "Abonnement" ADD CONSTRAINT "Abonnement_formuleId_fkey" FOREIGN KEY ("formuleId") REFERENCES "FormuleAbonnement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_abonnementId_fkey" FOREIGN KEY ("abonnementId") REFERENCES "Abonnement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed des 4 formules — PRIX TEMPORAIRES / À CONFIGURER (voir Paramètres >
-- Abonnement une fois l'écran d'admin construit, ou modifiable directement
-- en base en attendant). ON CONFLICT DO NOTHING : idempotent si cette
-- migration est rejouée (ne duplique jamais les lignes).
INSERT INTO "FormuleAbonnement" ("id", "dureeMois", "nom", "prix", "actif", "createdAt", "updatedAt") VALUES
  ('formule-1-mois',  1,  '1 mois',  5000.00,  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('formule-3-mois',  3,  '3 mois',  13500.00, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('formule-6-mois',  6,  '6 mois',  25000.00, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('formule-12-mois', 12, '12 mois', 45000.00, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("dureeMois") DO NOTHING;
