-- Inscription en libre-service (Phase 8 suite) : ajoute l'identité de la
-- personne (prénom/nom/email) sur User, et ville/pays sur Atelier — tous
-- NULLABLE (les comptes/ateliers existants avant cette phase n'ont pas ces
-- informations, jamais rétro-remplies artificiellement). Contrairement à la
-- migration atelierId (20260913051222), aucune colonne ne passe en NOT NULL
-- ici : ces champs sont validés comme requis côté application (Zod, voir
-- auth.schema.js) uniquement pour le flux d'inscription, pas au niveau base.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "prenom" TEXT,
ADD COLUMN     "nom" TEXT,
ADD COLUMN     "email" TEXT;

-- AlterTable
ALTER TABLE "Atelier" ADD COLUMN     "ville" TEXT,
ADD COLUMN     "pays" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
