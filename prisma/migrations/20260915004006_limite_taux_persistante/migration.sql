-- Rate-limiting persistant (voir lib/rateLimiter.js) — remplace le store
-- en mémoire d'express-rate-limit, non fiable en environnement serverless
-- (plusieurs instances de fonction, chacune avec son propre compteur).
-- Table indépendante du reste du schéma métier, purgée périodiquement de
-- façon opportuniste (pas de job dédié nécessaire vu le faible volume).

-- CreateTable
CREATE TABLE "LimiteTaux" (
    "id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "fenetreDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "compte" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LimiteTaux_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LimiteTaux_cle_key" ON "LimiteTaux"("cle");
