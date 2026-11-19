-- Traçabilité des mouvements de stock : qui a fait le mouvement, et d'où il vient.
-- `source` rend l'origine explicite (au lieu de la déduire de ligneAchatId) : une future consommation automatique
-- des matières par les commandes s'ajoutera comme une nouvelle valeur de l'énumération, sans toucher aux mouvements existants.

CREATE TYPE "SourceMouvementStock" AS ENUM ('MANUEL', 'RECEPTION_ACHAT', 'STOCK_INITIAL');

ALTER TABLE "MouvementStock" ADD COLUMN "source" "SourceMouvementStock" NOT NULL DEFAULT 'MANUEL';
ALTER TABLE "MouvementStock" ADD COLUMN "creeParId" TEXT;

-- Reprise des mouvements existants : réception d'achat (liée à une ligne d'achat), stock initial, sinon manuel.
UPDATE "MouvementStock" SET "source" = 'RECEPTION_ACHAT' WHERE "ligneAchatId" IS NOT NULL;
UPDATE "MouvementStock" SET "source" = 'STOCK_INITIAL' WHERE "ligneAchatId" IS NULL AND "type" = 'ENTREE' AND "motif" = 'Stock initial';

-- L'auteur n'est jamais effacé avec le compte : s'il disparaît, le mouvement reste, sans auteur.
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "MouvementStock_creeParId_idx" ON "MouvementStock"("creeParId");

-- Règles de cohérence, NOT VALID : appliquées à toute nouvelle ligne, sans exiger que l'historique existant les respecte.
-- Une réception d'achat est toujours une entrée liée à une ligne d'achat, et seulement elle.
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_source_coherente_chk"
  CHECK (("source" = 'RECEPTION_ACHAT') = ("ligneAchatId" IS NOT NULL) AND ("source" <> 'RECEPTION_ACHAT' OR "type" = 'ENTREE')) NOT VALID;
-- Une sortie est toujours manuelle (pour l'instant) et toujours justifiée par un motif non vide.
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_sortie_motif_chk"
  CHECK ("type" <> 'SORTIE' OR ("source" = 'MANUEL' AND length(btrim(coalesce("motif", ''))) > 0)) NOT VALID;
