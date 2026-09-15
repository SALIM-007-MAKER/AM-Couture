-- CreateTable
CREATE TABLE "JournalImpersonation" (
    "id" TEXT NOT NULL,
    "superadminId" TEXT NOT NULL,
    "superadminIdentifiant" TEXT NOT NULL,
    "atelierId" TEXT NOT NULL,
    "atelierNom" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "adminIdentifiant" TEXT NOT NULL,
    "demarreLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalImpersonation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalImpersonation_atelierId_idx" ON "JournalImpersonation"("atelierId");

-- CreateIndex
CREATE INDEX "JournalImpersonation_superadminId_idx" ON "JournalImpersonation"("superadminId");
