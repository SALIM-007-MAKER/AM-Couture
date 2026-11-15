-- CreateTable
CREATE TABLE "CleIdempotence" (
    "id" TEXT NOT NULL,
    "portee" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "methode" TEXT NOT NULL,
    "chemin" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "statut" TEXT NOT NULL,
    "reponseStatut" INTEGER,
    "reponseCorps" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CleIdempotence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CleIdempotence_portee_cle_key" ON "CleIdempotence"("portee", "cle");

-- CreateIndex
CREATE INDEX "CleIdempotence_expireLe_idx" ON "CleIdempotence"("expireLe");
