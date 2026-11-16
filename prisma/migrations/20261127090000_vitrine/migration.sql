-- AlterTable
ALTER TABLE "Atelier" ADD COLUMN     "couleurPrincipale" TEXT,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "vitrineActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vitrineContact" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vitrineDescription" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Atelier_slug_key" ON "Atelier"("slug");

