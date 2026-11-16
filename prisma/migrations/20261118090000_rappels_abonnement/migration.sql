-- CreateTable
CREATE TABLE "RappelAbonnement" (
    "id" TEXT NOT NULL,
    "atelierId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "envoyeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RappelAbonnement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RappelAbonnement_atelierId_type_cle_key" ON "RappelAbonnement"("atelierId", "type", "cle");

-- AddForeignKey
ALTER TABLE "RappelAbonnement" ADD CONSTRAINT "RappelAbonnement_atelierId_fkey" FOREIGN KEY ("atelierId") REFERENCES "Atelier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
