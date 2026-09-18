-- AlterTable
ALTER TABLE "PlanAbonnement" ADD COLUMN     "tarifsDuree" JSONB NOT NULL DEFAULT '[]';
-- CreateTable
CREATE TABLE "ParametresPlateforme" (
    "id" TEXT NOT NULL DEFAULT 'plateforme',
    "contactWhatsapp" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ParametresPlateforme_pkey" PRIMARY KEY ("id")
);
