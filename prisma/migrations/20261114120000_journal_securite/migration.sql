-- CreateTable
CREATE TABLE "JournalSecurite" (
    "id" TEXT NOT NULL,
    "evenement" TEXT NOT NULL,
    "userId" TEXT,
    "atelierId" TEXT,
    "ip" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalSecurite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalSecurite_createdAt_idx" ON "JournalSecurite"("createdAt");

-- CreateIndex
CREATE INDEX "JournalSecurite_evenement_createdAt_idx" ON "JournalSecurite"("evenement", "createdAt");

-- CreateIndex
CREATE INDEX "JournalSecurite_atelierId_createdAt_idx" ON "JournalSecurite"("atelierId", "createdAt");

-- CreateIndex
CREATE INDEX "JournalSecurite_userId_createdAt_idx" ON "JournalSecurite"("userId", "createdAt");
