-- AlterTable
ALTER TABLE "Commande" ADD COLUMN     "assigneAId" TEXT,
ADD COLUMN     "assigneLe" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AffectationCommande" (
    "id" TEXT NOT NULL,
    "atelierId" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "employeId" TEXT,
    "parId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffectationCommande_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AffectationCommande_commandeId_createdAt_idx" ON "AffectationCommande"("commandeId", "createdAt");

-- CreateIndex
CREATE INDEX "AffectationCommande_atelierId_idx" ON "AffectationCommande"("atelierId");

-- CreateIndex
CREATE INDEX "Commande_atelierId_assigneAId_statut_idx" ON "Commande"("atelierId", "assigneAId", "statut");

-- AddForeignKey
ALTER TABLE "Commande" ADD CONSTRAINT "Commande_assigneAId_fkey" FOREIGN KEY ("assigneAId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationCommande" ADD CONSTRAINT "AffectationCommande_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationCommande" ADD CONSTRAINT "AffectationCommande_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationCommande" ADD CONSTRAINT "AffectationCommande_parId_fkey" FOREIGN KEY ("parId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

