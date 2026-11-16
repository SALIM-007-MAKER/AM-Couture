-- AlterTable
ALTER TABLE "Modele" ADD COLUMN     "publie" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ImageAtelier" (
    "id" TEXT NOT NULL,
    "atelierId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "contenu" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageAtelier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoModele" (
    "id" TEXT NOT NULL,
    "modeleId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "legende" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoModele_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImageAtelier_atelierId_idx" ON "ImageAtelier"("atelierId");

-- CreateIndex
CREATE INDEX "PhotoModele_modeleId_ordre_idx" ON "PhotoModele"("modeleId", "ordre");

-- AddForeignKey
ALTER TABLE "ImageAtelier" ADD CONSTRAINT "ImageAtelier_atelierId_fkey" FOREIGN KEY ("atelierId") REFERENCES "Atelier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoModele" ADD CONSTRAINT "PhotoModele_modeleId_fkey" FOREIGN KEY ("modeleId") REFERENCES "Modele"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoModele" ADD CONSTRAINT "PhotoModele_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "ImageAtelier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

