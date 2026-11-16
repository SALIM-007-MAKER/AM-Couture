-- CreateEnum
CREATE TYPE "OrigineDemande" AS ENUM ('CLIENT', 'VITRINE');

-- AlterTable
ALTER TABLE "Atelier" ADD COLUMN     "demandesEnLigne" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DemandeCommande" ADD COLUMN     "consentementLe" TIMESTAMP(3),
ADD COLUMN     "contactNom" TEXT,
ADD COLUMN     "contactPrenom" TEXT,
ADD COLUMN     "contactTelephone" TEXT,
ADD COLUMN     "origine" "OrigineDemande" NOT NULL DEFAULT 'CLIENT',
ALTER COLUMN "clienteId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "DemandeCommande_origine_createdAt_idx" ON "DemandeCommande"("origine", "createdAt");


-- Garde-fou : une demande sans fiche cliente porte forcément les coordonnées du visiteur ET son consentement.
ALTER TABLE "DemandeCommande" ADD CONSTRAINT "DemandeCommande_cliente_ou_contact_check" CHECK (
  "clienteId" IS NOT NULL OR ("contactNom" IS NOT NULL AND "contactPrenom" IS NOT NULL AND "contactTelephone" IS NOT NULL AND "consentementLe" IS NOT NULL)
);
