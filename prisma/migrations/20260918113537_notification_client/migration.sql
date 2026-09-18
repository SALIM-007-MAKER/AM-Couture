-- CreateEnum
CREATE TYPE "TypeNotificationClient" AS ENUM ('COMMANDE_CREEE', 'COMMANDE_STATUT_CHANGE', 'COMMANDE_ANNULEE', 'PAIEMENT_ENREGISTRE', 'LIVRAISON_ENREGISTREE', 'RECU_EMIS', 'DEMANDE_ACCEPTEE', 'DEMANDE_REFUSEE');

-- CreateTable
CREATE TABLE "NotificationClient" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "commandeId" TEXT,
    "type" "TypeNotificationClient" NOT NULL,
    "message" TEXT NOT NULL,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationClient_clienteId_idx" ON "NotificationClient"("clienteId");

-- CreateIndex
CREATE INDEX "NotificationClient_lu_idx" ON "NotificationClient"("lu");

-- AddForeignKey
ALTER TABLE "NotificationClient" ADD CONSTRAINT "NotificationClient_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationClient" ADD CONSTRAINT "NotificationClient_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

