-- CreateEnum
CREATE TYPE "UniteStock" AS ENUM ('METRE', 'PIECE', 'KG', 'LITRE', 'ROULEAU', 'PAQUET', 'AUTRE');

-- CreateEnum
CREATE TYPE "TypeMouvementStock" AS ENUM ('ENTREE', 'SORTIE');

-- CreateTable
CREATE TABLE "ArticleStock" (
    "id" TEXT NOT NULL,
    "atelierId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "categorie" TEXT,
    "unite" "UniteStock" NOT NULL DEFAULT 'PIECE',
    "seuilAlerte" DECIMAL(10,2),
    "prixUnitaire" DECIMAL(10,2),
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MouvementStock" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "type" "TypeMouvementStock" NOT NULL,
    "quantite" DECIMAL(10,2) NOT NULL,
    "motif" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MouvementStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArticleStock_atelierId_idx" ON "ArticleStock"("atelierId");

-- CreateIndex
CREATE INDEX "ArticleStock_nom_idx" ON "ArticleStock"("nom");

-- CreateIndex
CREATE INDEX "MouvementStock_articleId_idx" ON "MouvementStock"("articleId");

-- AddForeignKey
ALTER TABLE "ArticleStock" ADD CONSTRAINT "ArticleStock_atelierId_fkey" FOREIGN KEY ("atelierId") REFERENCES "Atelier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "ArticleStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
