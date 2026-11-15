-- CreateEnum
CREATE TYPE "StatutAchat" AS ENUM ('COMMANDE', 'ANNULE');

-- AlterTable
ALTER TABLE "MouvementStock" ADD COLUMN     "ligneAchatId" TEXT;

-- CreateTable
CREATE TABLE "Achat" (
    "id" TEXT NOT NULL,
    "atelierId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fournisseurId" TEXT NOT NULL,
    "statut" "StatutAchat" NOT NULL DEFAULT 'COMMANDE',
    "dateCommande" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateAttendue" TIMESTAMP(3),
    "notes" TEXT,
    "depenseId" TEXT,
    "annuleAt" TIMESTAMP(3),
    "annuleMotif" TEXT,
    "creeParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Achat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneAchat" (
    "id" TEXT NOT NULL,
    "achatId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "quantite" DECIMAL(10,2) NOT NULL,
    "prixUnitaire" DECIMAL(10,2) NOT NULL,
    "quantiteRecue" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "LigneAchat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Achat_numero_key" ON "Achat"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Achat_depenseId_key" ON "Achat"("depenseId");

-- CreateIndex
CREATE INDEX "Achat_atelierId_statut_idx" ON "Achat"("atelierId", "statut");

-- CreateIndex
CREATE INDEX "Achat_fournisseurId_idx" ON "Achat"("fournisseurId");

-- CreateIndex
CREATE INDEX "LigneAchat_articleId_idx" ON "LigneAchat"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "LigneAchat_achatId_articleId_key" ON "LigneAchat"("achatId", "articleId");

-- CreateIndex
CREATE INDEX "MouvementStock_ligneAchatId_idx" ON "MouvementStock"("ligneAchatId");

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_ligneAchatId_fkey" FOREIGN KEY ("ligneAchatId") REFERENCES "LigneAchat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achat" ADD CONSTRAINT "Achat_atelierId_fkey" FOREIGN KEY ("atelierId") REFERENCES "Atelier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achat" ADD CONSTRAINT "Achat_fournisseurId_fkey" FOREIGN KEY ("fournisseurId") REFERENCES "Fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achat" ADD CONSTRAINT "Achat_depenseId_fkey" FOREIGN KEY ("depenseId") REFERENCES "Depense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneAchat" ADD CONSTRAINT "LigneAchat_achatId_fkey" FOREIGN KEY ("achatId") REFERENCES "Achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneAchat" ADD CONSTRAINT "LigneAchat_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "ArticleStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Garde-fou en base : on ne peut jamais recevoir plus que commandé, ni une quantité négative.
ALTER TABLE "LigneAchat" ADD CONSTRAINT "LigneAchat_quantites_check" CHECK ("quantite" > 0 AND "quantiteRecue" >= 0 AND "quantiteRecue" <= "quantite" AND "prixUnitaire" >= 0);
