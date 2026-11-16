-- PRÉ-CONTRÔLE des contraintes CHECK — LECTURE SEULE (SELECT uniquement, aucune écriture).
--
-- À exécuter par le propriétaire AVANT de déployer la migration 20261116090000_contraintes_check_not_valid,
-- sur la base de production (console SQL de Neon, ou `psql "$DIRECT_URL" -f scripts/preflight-contraintes.sql`).
-- Chaque requête renvoie les lignes qui VIOLERAIENT la contrainte correspondante. RÉSULTAT ATTENDU : aucune
-- ligne pour toutes les requêtes. Si une requête renvoie des lignes, ne pas déployer avant d'avoir décidé
-- quoi en faire (corriger la valeur, ou me demander une procédure) : une ancienne ligne invalide ne pourrait
-- plus être modifiée une fois la contrainte posée. Ne contient aucune donnée personnelle (identifiants et
-- valeurs numériques seulement). Voir docs/CONTRAINTES-CHECK.md.
--
-- Le format « -- @requete <nom> » est lu par un test automatique : ne pas le modifier.

-- @requete Paiement.montant >= 0.01
SELECT id, "commandeId", montant FROM "Paiement" WHERE NOT ("montant" >= 0.01) LIMIT 100;

-- @requete Commande.prixTotal >= 0.01
SELECT id, numero, "prixTotal" FROM "Commande" WHERE NOT ("prixTotal" >= 0.01) LIMIT 100;

-- @requete Commande.quantite entre 1 et 50
SELECT id, numero, quantite FROM "Commande" WHERE NOT ("quantite" BETWEEN 1 AND 50) LIMIT 100;

-- @requete Depense.montant >= 0.01
SELECT id, "atelierId", montant FROM "Depense" WHERE NOT ("montant" >= 0.01) LIMIT 100;

-- @requete MouvementStock.quantite >= 0.01
SELECT id, "articleId", type, quantite FROM "MouvementStock" WHERE NOT ("quantite" >= 0.01) LIMIT 100;

-- @requete Livraison.montantRestant >= 0
SELECT id, "commandeId", "montantRestant" FROM "Livraison" WHERE NOT ("montantRestant" >= 0) LIMIT 100;

-- @requete Recu.montantPaye >= 0.01
SELECT id, numero, "montantPaye" FROM "Recu" WHERE NOT ("montantPaye" >= 0.01) LIMIT 100;

-- @requete Modele.prixIndicatif >= 0.01 (ou absent)
SELECT id, "atelierId", "prixIndicatif" FROM "Modele" WHERE NOT ("prixIndicatif" IS NULL OR "prixIndicatif" >= 0.01) LIMIT 100;

-- @requete ArticleStock.seuilAlerte >= 0 (ou absent)
SELECT id, "atelierId", "seuilAlerte" FROM "ArticleStock" WHERE NOT ("seuilAlerte" IS NULL OR "seuilAlerte" >= 0) LIMIT 100;

-- @requete ArticleStock.prixUnitaire >= 0.01 (ou absent)
SELECT id, "atelierId", "prixUnitaire" FROM "ArticleStock" WHERE NOT ("prixUnitaire" IS NULL OR "prixUnitaire" >= 0.01) LIMIT 100;

-- @requete Abonnement.prix >= 0
SELECT id, numero, prix FROM "Abonnement" WHERE NOT ("prix" >= 0) LIMIT 100;

-- @requete PlanAbonnement.prixMensuel >= 0
SELECT id, nom, "prixMensuel" FROM "PlanAbonnement" WHERE NOT ("prixMensuel" >= 0) LIMIT 100;

-- @requete FormuleAbonnement.prix >= 0
SELECT id, nom, prix FROM "FormuleAbonnement" WHERE NOT ("prix" >= 0) LIMIT 100;
