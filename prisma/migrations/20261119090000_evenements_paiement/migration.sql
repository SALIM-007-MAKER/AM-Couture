-- CreateTable
CREATE TABLE "EvenementPaiement" (
    "id" TEXT NOT NULL,
    "fournisseur" TEXT NOT NULL,
    "evenementId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recuLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvenementPaiement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EvenementPaiement_fournisseur_evenementId_key" ON "EvenementPaiement"("fournisseur", "evenementId");
