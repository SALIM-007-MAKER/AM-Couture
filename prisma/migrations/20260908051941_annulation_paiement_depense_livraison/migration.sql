-- DropIndex
DROP INDEX "Livraison_commandeId_key";

-- AlterTable
ALTER TABLE "Depense" ADD COLUMN     "annuleAt" TIMESTAMP(3),
ADD COLUMN     "annuleMotif" TEXT;

-- AlterTable
ALTER TABLE "Livraison" ADD COLUMN     "annuleAt" TIMESTAMP(3),
ADD COLUMN     "annuleMotif" TEXT;

-- AlterTable
ALTER TABLE "Paiement" ADD COLUMN     "annuleAt" TIMESTAMP(3),
ADD COLUMN     "annuleMotif" TEXT;

-- CreateIndex
CREATE INDEX "Livraison_commandeId_idx" ON "Livraison"("commandeId");

-- CreateIndex
-- Index unique PARTIEL (non exprimable dans le DSL de schema.prisma) : au
-- plus une ligne Livraison ACTIVE (annuleAt IS NULL) par commande. Backstop
-- en base pour la vérification applicative faite dans
-- routes/livraisons.routes.js — une livraison annulée n'est plus comptée,
-- donc une nouvelle livraison peut être enregistrée pour la même commande.
CREATE UNIQUE INDEX "Livraison_commandeId_active_key" ON "Livraison"("commandeId") WHERE "annuleAt" IS NULL;
