-- Gestion des ateliers côté SUPERADMIN (suite Phase 8) : suspension d'un
-- atelier + horodatage de dernière connexion pour le fil d'activité. Toutes
-- les colonnes ont une valeur par défaut ou sont NULLABLE — aucune ligne
-- existante affectée (tous les ateliers existants restent actifs=true).

-- AlterTable
ALTER TABLE "Atelier" ADD COLUMN     "actif" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "suspenduLe" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "derniereConnexionAt" TIMESTAMP(3);
