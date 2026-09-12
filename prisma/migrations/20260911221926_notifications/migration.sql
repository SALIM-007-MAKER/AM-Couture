-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('RETARD', 'PRET', 'LIVRAISON_PROCHE', 'IMPAYE');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "commandeId" TEXT NOT NULL,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_lu_idx" ON "Notification"("lu");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_type_commandeId_key" ON "Notification"("type", "commandeId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE CASCADE ON UPDATE CASCADE;
