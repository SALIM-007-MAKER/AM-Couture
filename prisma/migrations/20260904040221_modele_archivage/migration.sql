/*
  Warnings:

  - Added the required column `updatedAt` to the `Modele` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Modele" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Modele_nom_idx" ON "Modele"("nom");
