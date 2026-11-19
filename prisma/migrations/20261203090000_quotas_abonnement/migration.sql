-- Quotas commerciaux des formules : limites figées dans chaque abonnement, et plancher d'usage reporté.
-- Migration ADDITIVE : deux colonnes avec valeur par défaut '{}' (illimité). Les abonnements existants prennent
-- '{}' : aucun quota ne leur est attribué automatiquement. Aucune donnée n'est modifiée ni supprimée.
ALTER TABLE "Abonnement" ADD COLUMN "limites" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Abonnement" ADD COLUMN "plancher" JSONB NOT NULL DEFAULT '{}';
