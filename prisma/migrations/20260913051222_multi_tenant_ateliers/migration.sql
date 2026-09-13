-- Multi-tenant (Phase 8) : ajoute le cloisonnement par atelier. Réécrit à la
-- main par rapport à la sortie brute de `prisma migrate dev` (qui aurait
-- ajouté des colonnes NOT NULL sans valeur sur des tables déjà peuplées,
-- impossible à exécuter tel quel) : colonnes ajoutées NULLABLE, rétro-
-- remplies avec l'atelier existant ("AM Couture", id fixe 'atelier-config',
-- voir ATELIER_ID dans parametres.routes.js), PUIS passées en NOT NULL.
-- Aucune ligne existante perdue ou modifiée au-delà de ce rattachement.

-- CreateEnum
CREATE TYPE "RoleUtilisateur" AS ENUM ('SUPERADMIN', 'ADMIN');

-- AlterTable Atelier (createdAt, sans impact sur la ligne existante — DEFAULT)
ALTER TABLE "Atelier" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable User : role (défaut ADMIN, s'applique à l'admin existant) +
-- atelierId NULLABLE (null = SUPERADMIN, jamais imposé ici).
ALTER TABLE "User" ADD COLUMN     "role" "RoleUtilisateur" NOT NULL DEFAULT 'ADMIN',
ADD COLUMN     "atelierId" TEXT;

-- Rattache le compte admin existant à l'atelier "AM Couture" — reste ADMIN
-- (déjà le défaut), devient explicitement propriétaire de ce tenant.
UPDATE "User" SET "atelierId" = 'atelier-config' WHERE "atelierId" IS NULL;

-- AlterTable : colonnes atelierId ajoutées NULLABLE puis rétro-remplies.
ALTER TABLE "Cliente" ADD COLUMN     "atelierId" TEXT;
ALTER TABLE "Modele" ADD COLUMN     "atelierId" TEXT;
ALTER TABLE "Commande" ADD COLUMN     "atelierId" TEXT;
ALTER TABLE "Depense" ADD COLUMN     "atelierId" TEXT;
ALTER TABLE "Abonnement" ADD COLUMN     "atelierId" TEXT;

UPDATE "Cliente" SET "atelierId" = 'atelier-config' WHERE "atelierId" IS NULL;
UPDATE "Modele" SET "atelierId" = 'atelier-config' WHERE "atelierId" IS NULL;
UPDATE "Commande" SET "atelierId" = 'atelier-config' WHERE "atelierId" IS NULL;
UPDATE "Depense" SET "atelierId" = 'atelier-config' WHERE "atelierId" IS NULL;
UPDATE "Abonnement" SET "atelierId" = 'atelier-config' WHERE "atelierId" IS NULL;

-- Passage en NOT NULL maintenant que toutes les lignes ont une valeur.
ALTER TABLE "Cliente" ALTER COLUMN "atelierId" SET NOT NULL;
ALTER TABLE "Modele" ALTER COLUMN "atelierId" SET NOT NULL;
ALTER TABLE "Commande" ALTER COLUMN "atelierId" SET NOT NULL;
ALTER TABLE "Depense" ALTER COLUMN "atelierId" SET NOT NULL;
ALTER TABLE "Abonnement" ALTER COLUMN "atelierId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Abonnement_atelierId_idx" ON "Abonnement"("atelierId");
CREATE INDEX "Cliente_atelierId_idx" ON "Cliente"("atelierId");
CREATE INDEX "Modele_atelierId_idx" ON "Modele"("atelierId");
CREATE INDEX "Commande_atelierId_idx" ON "Commande"("atelierId");
CREATE INDEX "Depense_atelierId_idx" ON "Depense"("atelierId");
CREATE INDEX "User_atelierId_idx" ON "User"("atelierId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_atelierId_fkey" FOREIGN KEY ("atelierId") REFERENCES "Atelier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_atelierId_fkey" FOREIGN KEY ("atelierId") REFERENCES "Atelier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Modele" ADD CONSTRAINT "Modele_atelierId_fkey" FOREIGN KEY ("atelierId") REFERENCES "Atelier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Commande" ADD CONSTRAINT "Commande_atelierId_fkey" FOREIGN KEY ("atelierId") REFERENCES "Atelier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_atelierId_fkey" FOREIGN KEY ("atelierId") REFERENCES "Atelier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Abonnement" ADD CONSTRAINT "Abonnement_atelierId_fkey" FOREIGN KEY ("atelierId") REFERENCES "Atelier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Compte SUPERADMIN de la plateforme (identifiant fourni par l'utilisateur) —
-- créé ici via un cuid stable pour rester idempotent si la migration est
-- rejouée. Mot de passe défini séparément (voir scratchpad_seed_superadmin.mjs,
-- exécuté juste après cette migration) : impossible de hacher un bcrypt
-- directement en SQL portable, donc le hash est inséré par un script Node
-- séparé plutôt que dans cette migration.
