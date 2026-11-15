-- VALIDATION des contraintes CHECK sur les ANCIENNES lignes — étape SÉPARÉE et FACULTATIVE.
--
-- À exécuter seulement APRÈS le déploiement de la migration 20261116090000_contraintes_check_not_valid ET
-- après que scripts/preflight-contraintes.sql ne renvoie plus aucune ligne. VALIDATE CONSTRAINT parcourt
-- la table (verrou léger : n'empêche pas les lectures ni les écritures) ; il échoue, sans rien modifier,
-- si une ligne invalide subsiste. Une fois validée, une contrainte garantit la totalité de la table.
--
-- Ce fichier n'est PAS une migration Prisma : il n'est exécuté ni par Vercel ni par `prisma migrate`.

ALTER TABLE "Paiement" VALIDATE CONSTRAINT "Paiement_montant_positif_chk";
ALTER TABLE "Commande" VALIDATE CONSTRAINT "Commande_prixTotal_positif_chk";
ALTER TABLE "Commande" VALIDATE CONSTRAINT "Commande_quantite_bornes_chk";
ALTER TABLE "Depense" VALIDATE CONSTRAINT "Depense_montant_positif_chk";
ALTER TABLE "MouvementStock" VALIDATE CONSTRAINT "MouvementStock_quantite_positive_chk";
ALTER TABLE "Livraison" VALIDATE CONSTRAINT "Livraison_montantRestant_positif_chk";
ALTER TABLE "Recu" VALIDATE CONSTRAINT "Recu_montantPaye_positif_chk";
ALTER TABLE "Modele" VALIDATE CONSTRAINT "Modele_prixIndicatif_positif_chk";
ALTER TABLE "ArticleStock" VALIDATE CONSTRAINT "ArticleStock_seuilAlerte_positif_chk";
ALTER TABLE "ArticleStock" VALIDATE CONSTRAINT "ArticleStock_prixUnitaire_positif_chk";
ALTER TABLE "Abonnement" VALIDATE CONSTRAINT "Abonnement_prix_positif_chk";
ALTER TABLE "PlanAbonnement" VALIDATE CONSTRAINT "PlanAbonnement_prixMensuel_positif_chk";
ALTER TABLE "FormuleAbonnement" VALIDATE CONSTRAINT "FormuleAbonnement_prix_positif_chk";
