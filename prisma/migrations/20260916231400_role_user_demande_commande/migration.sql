-- CreateEnum
CREATE TYPE "StatutDemandeCommande" AS ENUM ('EN_ATTENTE', 'ACCEPTEE', 'REFUSEE');

-- AlterEnum
ALTER TYPE "RoleUtilisateur" ADD VALUE 'USER';

-- AlterEnum
ALTER TYPE "TypeTokenAction" ADD VALUE 'INVITATION_CLIENT';

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "DemandeCommande" (
    "id" TEXT NOT NULL,
    "atelierId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "modeleId" TEXT,
    "description" TEXT,
    "statut" "StatutDemandeCommande" NOT NULL DEFAULT 'EN_ATTENTE',
    "motifRefus" TEXT,
    "commandeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandeCommande_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemandeCommande_commandeId_key" ON "DemandeCommande"("commandeId");

-- CreateIndex
CREATE INDEX "DemandeCommande_atelierId_idx" ON "DemandeCommande"("atelierId");

-- CreateIndex
CREATE INDEX "DemandeCommande_clienteId_idx" ON "DemandeCommande"("clienteId");

-- CreateIndex
CREATE INDEX "DemandeCommande_statut_idx" ON "DemandeCommande"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_userId_key" ON "Cliente"("userId");

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeCommande" ADD CONSTRAINT "DemandeCommande_atelierId_fkey" FOREIGN KEY ("atelierId") REFERENCES "Atelier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeCommande" ADD CONSTRAINT "DemandeCommande_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeCommande" ADD CONSTRAINT "DemandeCommande_modeleId_fkey" FOREIGN KEY ("modeleId") REFERENCES "Modele"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeCommande" ADD CONSTRAINT "DemandeCommande_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

