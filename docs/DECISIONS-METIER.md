# Décisions métier validées

Décisions arrêtées avec le propriétaire du projet. Elles guident les lots de la phase « Consolidation
métier » ; seules celles marquées **Implémentée** sont dans le code.

## Validées le 15 novembre 2026 (statut : à implémenter, lots C et D)

| # | Décision | Statut |
|---|---|---|
| D1 | **Commandes annulées exclues des montants** : valeur des commandes, créances à encaisser et totaux cliente n'incluent plus les annulées. Les paiements déjà encaissés restent dans l'historique et sont marqués « à rembourser ou à convertir en avoir ». | À implémenter (lot C) |
| D2 | **Remboursement ET avoir** : entité tracée (montant, mode, motif, auteur, date) permettant soit le remboursement à la cliente, soit un avoir consommable sur une autre commande. L'historique des paiements n'est jamais modifié. | À implémenter (lot D) |
| D3 | **Livraison avec solde restant autorisée sous confirmation tracée** : le retrait exige une confirmation explicite, enregistrée avec le solde restant et l'auteur ; la commande entre dans les créances à encaisser. | À implémenter (lot D) |
| D4 | **Correction de prix** : possible avant le premier paiement ; après paiement, procédure exceptionnelle et traçable. | À implémenter (lot D), orientation validée en phase 3 |
| D5 | **Fuseau horaire par atelier**, `Africa/Niamey` par défaut. | À implémenter (3.7) |
| D6 | **Numérotation indépendante par atelier**, sans modifier les anciens documents. | À implémenter (3.4) |
| D7 | **Identité de connexion cliente globale** (même téléphone dans plusieurs ateliers), données strictement séparées par atelier. | À implémenter (3.7) |

## Périmètre de la sous-phase 3.3 (validé tel que proposé)

- Verrous consultatifs sans modification de schéma pour l'unicité des clientes et des modèles.
- Contraintes `CHECK` ajoutées en `NOT VALID`, avec pré-contrôle des données de production exécuté par le
  propriétaire ; aucune migration n'est exécutée sur une base réelle par l'assistant.
- Idempotence : en-tête `Idempotency-Key` optionnel, seules les réponses 2xx sont rejouées, durée 24 h.
- Câblage de la clé côté interface : sous-phase 3.6.
- Entrées 5 à 8 ajoutées au registre des anomalies (`INVARIANTS.md` §4).

## Encore à trancher (ne bloque pas la 3.3)

Facture obligatoire ou reçu suffisant · définition exacte de l'alerte « solde à encaisser » · règle de
renouvellement d'abonnement (début = fin de la période active, ou date libre) · ajouts de modèle des lots
C à G (lien commande-mesure, historique des transitions, type `AJUSTEMENT`, table de remboursement/avoir).
