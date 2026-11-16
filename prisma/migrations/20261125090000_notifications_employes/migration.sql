-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TACHE_AFFECTEE';
ALTER TYPE "NotificationType" ADD VALUE 'STOCK_BAS';
ALTER TYPE "NotificationType" ADD VALUE 'ACHAT_EN_RETARD';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "achatId" TEXT,
ADD COLUMN     "articleId" TEXT,
ADD COLUMN     "atelierId" TEXT,
ADD COLUMN     "destinataireId" TEXT,
ALTER COLUMN "commandeId" DROP NOT NULL;

-- Les notifications existantes portent toutes sur une commande : leur atelier est celui de la commande.
UPDATE "Notification" n SET "atelierId" = c."atelierId" FROM "Commande" c WHERE c.id = n."commandeId";
ALTER TABLE "Notification" ALTER COLUMN "atelierId" SET NOT NULL;

-- CreateTable
CREATE TABLE "NotificationLue" (
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "luLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLue_pkey" PRIMARY KEY ("notificationId","userId")
);

-- CreateIndex
CREATE INDEX "NotificationLue_userId_idx" ON "NotificationLue"("userId");

-- CreateIndex
CREATE INDEX "Notification_atelierId_idx" ON "Notification"("atelierId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_type_articleId_key" ON "Notification"("type", "articleId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_type_achatId_key" ON "Notification"("type", "achatId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_atelierId_fkey" FOREIGN KEY ("atelierId") REFERENCES "Atelier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "ArticleStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_achatId_fkey" FOREIGN KEY ("achatId") REFERENCES "Achat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_destinataireId_fkey" FOREIGN KEY ("destinataireId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLue" ADD CONSTRAINT "NotificationLue_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLue" ADD CONSTRAINT "NotificationLue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Garde-fou : une notification porte sur exactement UNE chose (commande, article ou achat).
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_une_reference_check" CHECK (
  (("commandeId" IS NOT NULL)::int + ("articleId" IS NOT NULL)::int + ("achatId" IS NOT NULL)::int) = 1
);
