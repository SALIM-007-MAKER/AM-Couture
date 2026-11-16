-- AlterEnum
ALTER TYPE "RoleUtilisateur" ADD VALUE 'EMPLOYE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "actif" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "desactiveLe" TIMESTAMP(3),
ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "poste" TEXT,
ADD COLUMN     "telephone" TEXT;
