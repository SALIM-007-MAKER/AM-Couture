-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionAbonnement" ADD VALUE 'SOUSCRIPTION';
ALTER TYPE "ActionAbonnement" ADD VALUE 'CONFIRMATION_PAIEMENT';
ALTER TYPE "ActionAbonnement" ADD VALUE 'REJET_PAIEMENT';
ALTER TYPE "ActionAbonnement" ADD VALUE 'SUSPENSION';
ALTER TYPE "ActionAbonnement" ADD VALUE 'REACTIVATION';
ALTER TYPE "ActionAbonnement" ADD VALUE 'REMBOURSEMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MoyenPaiement" ADD VALUE 'MOBILE_MONEY';
ALTER TYPE "MoyenPaiement" ADD VALUE 'ESPECES';
ALTER TYPE "MoyenPaiement" ADD VALUE 'VIREMENT';
ALTER TYPE "MoyenPaiement" ADD VALUE 'AUTRE';

-- AlterEnum
ALTER TYPE "StatutAbonnement" ADD VALUE 'SUSPENDU';

-- AlterEnum
ALTER TYPE "StatutTransaction" ADD VALUE 'REMBOURSEE';

-- AlterTable
ALTER TABLE "ParametresPlateforme" ADD COLUMN     "joursGrace" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "PlanAbonnement" ADD COLUMN     "limites" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "atelierId" TEXT,
ADD COLUMN     "confirmeLe" TIMESTAMP(3),
ADD COLUMN     "confirmePar" TEXT,
ADD COLUMN     "declareLe" TIMESTAMP(3),
ADD COLUMN     "declarePar" TEXT,
ADD COLUMN     "motifRejet" TEXT,
ADD COLUMN     "motifRemboursement" TEXT,
ADD COLUMN     "operateur" TEXT,
ADD COLUMN     "preuveNote" TEXT,
ADD COLUMN     "rembourseLe" TIMESTAMP(3),
ADD COLUMN     "rembourseePar" TEXT;

-- CreateTable
CREATE TABLE "FactureAbonnement" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "abonnementId" TEXT NOT NULL,
    "atelierId" TEXT NOT NULL,
    "atelierNom" TEXT NOT NULL,
    "planNom" TEXT,
    "dureeMois" INTEGER,
    "periodeDebut" TIMESTAMP(3),
    "periodeFin" TIMESTAMP(3),
    "montant" DECIMAL(10,2) NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'FCFA',
    "moyenPaiement" "MoyenPaiement" NOT NULL,
    "referencePaiement" TEXT,
    "emisLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "annuleeLe" TIMESTAMP(3),
    "annuleeMotif" TEXT,

    CONSTRAINT "FactureAbonnement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FactureAbonnement_numero_key" ON "FactureAbonnement"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "FactureAbonnement_transactionId_key" ON "FactureAbonnement"("transactionId");

-- CreateIndex
CREATE INDEX "FactureAbonnement_atelierId_emisLe_idx" ON "FactureAbonnement"("atelierId", "emisLe");

-- CreateIndex
CREATE INDEX "Transaction_atelierId_statut_idx" ON "Transaction"("atelierId", "statut");

-- CreateIndex
CREATE INDEX "Transaction_statut_createdAt_idx" ON "Transaction"("statut", "createdAt");

-- AddForeignKey
ALTER TABLE "FactureAbonnement" ADD CONSTRAINT "FactureAbonnement_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reprise de l'existant : l'atelier d'une transaction déjà enregistrée se déduit de son abonnement (colonne nouvelle,
-- aucune donnée existante n'est modifiée par ailleurs).
UPDATE "Transaction" t SET "atelierId" = a."atelierId" FROM "Abonnement" a WHERE a.id = t."abonnementId" AND t."atelierId" IS NULL;

-- Une seule transaction en attente par abonnement : un double clic ou une double soumission ne peut pas créer deux
-- demandes de paiement pour la même souscription.
CREATE UNIQUE INDEX "Transaction_une_en_attente_par_abonnement" ON "Transaction"("abonnementId") WHERE "statut" = 'EN_ATTENTE';

-- Montants strictement positifs (NOT VALID : refuse les nouvelles écritures invalides sans relire l'existant,
-- comme les contraintes de la migration 20261116090000).
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_montant_positif" CHECK ("montant" > 0) NOT VALID;
ALTER TABLE "FactureAbonnement" ADD CONSTRAINT "FactureAbonnement_montant_positif" CHECK ("montant" > 0) NOT VALID;
ALTER TABLE "ParametresPlateforme" ADD CONSTRAINT "ParametresPlateforme_joursGrace_borne" CHECK ("joursGrace" BETWEEN 0 AND 90) NOT VALID;
