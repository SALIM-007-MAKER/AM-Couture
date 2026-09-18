-- CreateEnum
CREATE TYPE "ActionAbonnement" AS ENUM ('ACTIVATION', 'MODIFICATION', 'EXPIRATION', 'DESACTIVATION');
-- AlterTable
ALTER TABLE "Abonnement" ADD COLUMN     "creePar" TEXT,
ADD COLUMN     "dureeMois" INTEGER,
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "planNom" TEXT,
ALTER COLUMN "formuleId" DROP NOT NULL;
-- CreateTable
CREATE TABLE "PlanAbonnement" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "prixMensuel" DECIMAL(10,2) NOT NULL,
    "fonctionnalites" TEXT[],
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanAbonnement_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "HistoriqueAbonnement" (
    "id" TEXT NOT NULL,
    "atelierId" TEXT NOT NULL,
    "abonnementId" TEXT,
    "action" "ActionAbonnement" NOT NULL,
    "planNom" TEXT,
    "dureeMois" INTEGER,
    "dateDebut" TIMESTAMP(3),
    "dateExpiration" TIMESTAMP(3),
    "par" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoriqueAbonnement_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "PlanAbonnement_nom_key" ON "PlanAbonnement"("nom");
-- CreateIndex
CREATE INDEX "HistoriqueAbonnement_atelierId_createdAt_idx" ON "HistoriqueAbonnement"("atelierId", "createdAt");
-- CreateIndex
CREATE INDEX "Abonnement_planId_idx" ON "Abonnement"("planId");
-- AddForeignKey
ALTER TABLE "Abonnement" ADD CONSTRAINT "Abonnement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanAbonnement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "HistoriqueAbonnement" ADD CONSTRAINT "HistoriqueAbonnement_atelierId_fkey" FOREIGN KEY ("atelierId") REFERENCES "Atelier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "HistoriqueAbonnement" ADD CONSTRAINT "HistoriqueAbonnement_abonnementId_fkey" FOREIGN KEY ("abonnementId") REFERENCES "Abonnement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
