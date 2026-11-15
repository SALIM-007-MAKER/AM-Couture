-- Contraintes CHECK (sous-phase 3.3, anomalie 7) : la base refuse ce que la validation applicative
-- (Zod) refuse déjà. Bornes IDENTIQUES à celles de backend/src/schemas/*.
--
-- AJOUT EN « NOT VALID » : PostgreSQL contrôle les NOUVELLES écritures (insertions et modifications)
-- sans parcourir les lignes existantes. La migration ne peut donc pas échouer à cause d'anciennes
-- données, et ne pose qu'un verrou très bref. ATTENTION : une ancienne ligne qui viole la contrainte ne
-- pourra plus être MODIFIÉE (par exemple annulée) tant qu'elle n'est pas corrigée. Exécuter AVANT
-- le déploiement scripts/preflight-contraintes.sql (lecture seule) ; la validation des anciennes lignes
-- (VALIDATE CONSTRAINT) est une étape séparée : scripts/valider-contraintes.sql. Voir
-- docs/CONTRAINTES-CHECK.md.
--
-- Migration purement additive : aucune donnée lue, modifiée ni supprimée.

ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_montant_positif_chk" CHECK ("montant" >= 0.01) NOT VALID;

ALTER TABLE "Commande" ADD CONSTRAINT "Commande_prixTotal_positif_chk" CHECK ("prixTotal" >= 0.01) NOT VALID;
ALTER TABLE "Commande" ADD CONSTRAINT "Commande_quantite_bornes_chk" CHECK ("quantite" BETWEEN 1 AND 50) NOT VALID;

ALTER TABLE "Depense" ADD CONSTRAINT "Depense_montant_positif_chk" CHECK ("montant" >= 0.01) NOT VALID;

ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_quantite_positive_chk" CHECK ("quantite" >= 0.01) NOT VALID;

ALTER TABLE "Livraison" ADD CONSTRAINT "Livraison_montantRestant_positif_chk" CHECK ("montantRestant" >= 0) NOT VALID;

ALTER TABLE "Recu" ADD CONSTRAINT "Recu_montantPaye_positif_chk" CHECK ("montantPaye" >= 0.01) NOT VALID;

ALTER TABLE "Modele" ADD CONSTRAINT "Modele_prixIndicatif_positif_chk" CHECK ("prixIndicatif" IS NULL OR "prixIndicatif" >= 0.01) NOT VALID;

ALTER TABLE "ArticleStock" ADD CONSTRAINT "ArticleStock_seuilAlerte_positif_chk" CHECK ("seuilAlerte" IS NULL OR "seuilAlerte" >= 0) NOT VALID;
ALTER TABLE "ArticleStock" ADD CONSTRAINT "ArticleStock_prixUnitaire_positif_chk" CHECK ("prixUnitaire" IS NULL OR "prixUnitaire" >= 0.01) NOT VALID;

ALTER TABLE "Abonnement" ADD CONSTRAINT "Abonnement_prix_positif_chk" CHECK ("prix" >= 0) NOT VALID;
ALTER TABLE "PlanAbonnement" ADD CONSTRAINT "PlanAbonnement_prixMensuel_positif_chk" CHECK ("prixMensuel" >= 0) NOT VALID;
ALTER TABLE "FormuleAbonnement" ADD CONSTRAINT "FormuleAbonnement_prix_positif_chk" CHECK ("prix" >= 0) NOT VALID;
