-- CreateEnum
CREATE TYPE "Sexe" AS ENUM ('FEMME', 'HOMME', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutCommande" AS ENUM ('NOUVELLE', 'EN_CONFECTION', 'ESSAYAGE', 'RETOUCHES', 'TERMINEE', 'LIVREE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "Priorite" AS ENUM ('NORMALE', 'URGENTE');

-- CreateEnum
CREATE TYPE "ModePaiement" AS ENUM ('ESPECES', 'MOBILE_MONEY', 'VIREMENT', 'AUTRE');

-- CreateEnum
CREATE TYPE "CategorieVetement" AS ENUM ('ROBE', 'BOUBOU', 'ENSEMBLE', 'PANTALON', 'CHEMISE', 'JUPE', 'KAFTAN', 'COSTUME', 'TENUE_TRADITIONNELLE', 'AUTRE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "identifiant" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Atelier" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "logoUrl" TEXT,
    "telephone" TEXT,
    "adresse" TEXT,
    "slogan" TEXT,
    "devise" TEXT NOT NULL DEFAULT 'FCFA',
    "recuConfig" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Atelier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "telephone2" TEXT,
    "adresse" TEXT,
    "sexe" "Sexe",
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mesure" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "epaule" DECIMAL(6,2),
    "poitrine" DECIMAL(6,2),
    "taille" DECIMAL(6,2),
    "hanches" DECIMAL(6,2),
    "longueur" DECIMAL(6,2),
    "longueurRobe" DECIMAL(6,2),
    "longueurJupe" DECIMAL(6,2),
    "longueurPantalon" DECIMAL(6,2),
    "longueurManche" DECIMAL(6,2),
    "tourBras" DECIMAL(6,2),
    "tourCou" DECIMAL(6,2),
    "tourPoignet" DECIMAL(6,2),
    "tourCuisse" DECIMAL(6,2),
    "tourGenou" DECIMAL(6,2),
    "autres" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mesure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Modele" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "categorie" "CategorieVetement" NOT NULL,
    "description" TEXT,
    "prixIndicatif" DECIMAL(10,2),
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Modele_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commande" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "modeleId" TEXT,
    "typeVetement" "CategorieVetement" NOT NULL,
    "description" TEXT,
    "couleur" TEXT,
    "tissu" TEXT,
    "quantite" INTEGER NOT NULL DEFAULT 1,
    "prixTotal" DECIMAL(10,2) NOT NULL,
    "statut" "StatutCommande" NOT NULL DEFAULT 'NOUVELLE',
    "priorite" "Priorite" NOT NULL DEFAULT 'NORMALE',
    "dateCommande" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateLivraisonPrevue" TIMESTAMP(3) NOT NULL,
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paiement" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "montant" DECIMAL(10,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mode" "ModePaiement" NOT NULL,
    "reference" TEXT,
    "commentaire" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Livraison" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "dateLivraison" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "montantRestant" DECIMAL(10,2) NOT NULL,
    "commentaire" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Livraison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recu" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "paiementId" TEXT,
    "montantPaye" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Depense" (
    "id" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "montant" DECIMAL(10,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "justificatifUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Depense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "valeur" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_identifiant_key" ON "User"("identifiant");

-- CreateIndex
CREATE INDEX "Cliente_nom_prenom_idx" ON "Cliente"("nom", "prenom");

-- CreateIndex
CREATE INDEX "Cliente_telephone_idx" ON "Cliente"("telephone");

-- CreateIndex
CREATE INDEX "Mesure_clienteId_idx" ON "Mesure"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Commande_numero_key" ON "Commande"("numero");

-- CreateIndex
CREATE INDEX "Commande_clienteId_idx" ON "Commande"("clienteId");

-- CreateIndex
CREATE INDEX "Commande_statut_idx" ON "Commande"("statut");

-- CreateIndex
CREATE INDEX "Commande_dateLivraisonPrevue_idx" ON "Commande"("dateLivraisonPrevue");

-- CreateIndex
CREATE INDEX "Paiement_commandeId_idx" ON "Paiement"("commandeId");

-- CreateIndex
CREATE INDEX "Paiement_date_idx" ON "Paiement"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Livraison_commandeId_key" ON "Livraison"("commandeId");

-- CreateIndex
CREATE UNIQUE INDEX "Recu_numero_key" ON "Recu"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Recu_paiementId_key" ON "Recu"("paiementId");

-- CreateIndex
CREATE INDEX "Depense_date_idx" ON "Depense"("date");

-- CreateIndex
CREATE INDEX "Depense_categorie_idx" ON "Depense"("categorie");

-- AddForeignKey
ALTER TABLE "Mesure" ADD CONSTRAINT "Mesure_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commande" ADD CONSTRAINT "Commande_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commande" ADD CONSTRAINT "Commande_modeleId_fkey" FOREIGN KEY ("modeleId") REFERENCES "Modele"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Livraison" ADD CONSTRAINT "Livraison_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recu" ADD CONSTRAINT "Recu_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recu" ADD CONSTRAINT "Recu_paiementId_fkey" FOREIGN KEY ("paiementId") REFERENCES "Paiement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
