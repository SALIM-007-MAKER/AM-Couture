# Contraintes CHECK : procédure de déploiement

Sous-phase 3.3, anomalie 7. La base de données refuse désormais les valeurs que la validation
applicative refusait déjà (montant nul ou négatif, quantité hors bornes…). Migration :
`prisma/migrations/20261116090000_contraintes_check_not_valid`.

## Les 13 contraintes (bornes identiques à `backend/src/schemas/*`)

| Table | Contrainte |
|---|---|
| `Paiement` | `montant >= 0.01` |
| `Commande` | `prixTotal >= 0.01` · `quantite BETWEEN 1 AND 50` |
| `Depense` | `montant >= 0.01` |
| `MouvementStock` | `quantite >= 0.01` |
| `Livraison` | `montantRestant >= 0` |
| `Recu` | `montantPaye >= 0.01` |
| `Modele` | `prixIndicatif` absent ou `>= 0.01` |
| `ArticleStock` | `seuilAlerte` absent ou `>= 0` · `prixUnitaire` absent ou `>= 0.01` |
| `Abonnement` | `prix >= 0` |
| `PlanAbonnement` | `prixMensuel >= 0` |
| `FormuleAbonnement` | `prix >= 0` |

Ajoutées en **`NOT VALID`** : elles contrôlent les nouvelles écritures sans lire les lignes existantes.

## Ce que `NOT VALID` change pour les anciennes lignes (mesuré)

Sur une base peuplée contenant volontairement des lignes invalides (un paiement à 0, une commande à
`prixTotal` négatif et quantité 0) :

| Opération | Résultat |
|---|---|
| Appliquer la migration | **réussit**, aucune donnée lue ni modifiée (comptes identiques avant et après) |
| Nouvelle écriture invalide | refusée |
| Nouvelle écriture valide | acceptée |
| Modifier une ligne **valide** | acceptée |
| **Lire** une ancienne ligne invalide | acceptée |
| **Modifier** une ancienne ligne invalide (ex. annuler un paiement à 0) | **REFUSÉE** |
| `VALIDATE CONSTRAINT` tant qu'une ligne invalide existe | échoue, sans rien modifier |
| Corriger la ligne (valeur valide), puis `VALIDATE` | réussit |

**Risque** : si la production contient une ancienne ligne invalide, elle ne pourrait plus être
modifiée (par exemple annulée) tant qu'elle n'est pas corrigée. D'où le pré-contrôle ci-dessous.

## Procédure (à exécuter par le propriétaire du projet)

1. **Pré-contrôle (lecture seule)** sur la base de production : `scripts/preflight-contraintes.sql`
   (console SQL de Neon, ou `psql "$DIRECT_URL" -f scripts/preflight-contraintes.sql`). Il ne contient que des
   `SELECT` et ne renvoie que des identifiants et des valeurs numériques. **Résultat attendu : aucune ligne.**
2. Si des lignes sont renvoyées : **ne pas déployer** ; décider de la correction (valeur à rétablir) — ou
   demander une procédure dédiée. Ne rien corriger sans avoir identifié l'origine de la valeur.
3. Déployer la migration (exécutée par `prisma migrate deploy` au build Vercel). Elle est purement additive.
4. **Validation (facultative, séparée)** : une fois le pré-contrôle à zéro et la migration déployée,
   `scripts/valider-contraintes.sql` valide les anciennes lignes. Sans cette étape, les contraintes protègent
   déjà toutes les nouvelles écritures ; avec elle, la garantie couvre toute la table.

## Annuler la migration

Chaque contrainte se retire sans toucher aux données : `ALTER TABLE "Paiement" DROP CONSTRAINT
"Paiement_montant_positif_chk";` (et de même pour les autres).

## Ce qui n'est pas couvert

- Les contraintes **entre lignes** (somme des paiements ≤ prix, stock ≥ 0, une seule livraison active) ne
  s'expriment pas en `CHECK` : elles sont garanties par les verrous applicatifs (voir `docs/INVARIANTS.md`).
- Prisma ne voit pas les `CHECK` : `prisma migrate diff` ne signale aucune dérive. Toute évolution de ces
  bornes doit modifier à la fois les schémas Zod et une migration SQL.
- Aucune migration n'a été exécutée sur Neon ni sur la production par l'assistant.
