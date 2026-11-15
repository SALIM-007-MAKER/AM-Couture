# Phase 5 — Analyse du système d'abonnement existant

Constat établi par lecture du code et du schéma le 15 novembre 2026, avant tout développement. Rien n'a été modifié.

## 1. Ce qui existe

| Élément | État | Où |
|---|---|---|
| Essai de 15 jours | **Fonctionne** : `Atelier.trialEndsAt = inscription + 15 j`, évalué à chaque requête (aucune tâche planifiée nécessaire). Ateliers antérieurs (`trialEndsAt` null) : jamais bloqués | `lib/atelierProvisioning.js`, `lib/trial.js` |
| Plans | **Fonctionne** : `PlanAbonnement` (prix mensuel, fonctionnalités en texte libre, remises par durée), gérés par le SUPERADMIN. Prix figé à l'activation (`Abonnement.prix`) | `lib/abonnement.js`, `plans.routes.js` |
| Activation | **Manuelle uniquement** par le SUPERADMIN, idempotente, avec historique (`HistoriqueAbonnement`) | `ateliersAbonnement.routes.js` |
| États | `ACTIF`, `EN_ATTENTE`, `ESSAI`, `EXPIRE`, `AUCUN`, **dérivés** des dates (jamais stockés) : pas de dérive possible | `etatAbonnementAtelier` |
| Blocage | Essai terminé sans abonnement actif → **402 sur toutes les routes métier**, lecture comprise. Contournement en impersonation | `requireAbonnementActif` |
| Souscription par l'atelier | **N'existe pas** : `GET /api/abonnements/etat` est la seule route côté atelier, en lecture seule | `abonnements.routes.js` |
| Paiement en ligne | Code **dormant et non monté** : client Wave (`lib/wave.js`), 3 fournisseurs (`lib/payments/`), route de webhook. Aucune route ne crée de `Transaction` | `webhooks.routes.js` (non montée) |
| Tests | Essai/blocage et activation manuelle couverts (intégration). **Webhook, signature Wave et fournisseurs : aucun test** | |

## 2. Écarts avec le brief

| # | Brief | Écart constaté |
|---|---|---|
| 1 | Formules avec **limites** | Aucune limite chiffrée (clientes, commandes, comptes) : seule une liste de fonctionnalités en texte libre, non appliquée par le code |
| 3 | Souscription par l'atelier | Absente (voir ci-dessus) |
| 4 | Cycle de vie : **suspendus**, **renouvelés** | Pas d'état « suspendu » pour un abonnement (la suspension existe au niveau de l'atelier). Renouvellement : `activerAbonnement` repart de « maintenant » — **renouveler un abonnement encore actif ferait perdre les jours restants** |
| 5-6 | Paiement, vérification serveur | Rien d'actif. Dans le code dormant : relecture authentifiée chez Wave + contrôle référence/montant (bon principe) |
| 7 | Webhooks | Voir §3 : plusieurs écarts avec la documentation Wave |
| 8 | Factures | **Absentes** (pas de modèle, pas de PDF d'abonnement) |
| 9 | Rappels avant expiration | **Absents** (le cron ne traite que les rappels de commandes) |
| 10 | Impayés | Aucune règle : pas de délai de grâce, pas de relance |
| 11 | Limitation des accès | Blocage total, y compris la **lecture et l'export des données de l'atelier** : un atelier dont l'abonnement échoit ne peut plus récupérer ses propres clientes ni commandes |
| 12 | Tableau de bord SUPERADMIN | Existe en partie (liste des ateliers, état d'abonnement, tendances sur 6 mois). **Pas de revenus par plan, pas de vue des renouvellements à venir ni des transactions** |
| — | Remboursements, annulations | Rien (statuts `ANNULEE`/`EXPIREE` de transaction existent mais aucun flux) |

## 3. Écarts du code Wave avec la documentation officielle

Lue le 15/11/2026 sur docs.wave.com (pages Checkout et Webhooks).

| Sujet | Documentation Wave | Code actuel |
|---|---|---|
| Signature des webhooks | `Wave-Signature: t=…,v1=…`, HMAC-SHA256 de `t` + corps brut, tolérance 5 min, plusieurs `v1` pendant une rotation | **Conforme** |
| Identifiant d'événement | `id` unique par événement ; Wave peut **dupliquer, retarder ou désordonner** les événements | Non mémorisé : l'idempotence repose sur le statut de la transaction, **sans verrou** → deux webhooks simultanés peuvent passer tous deux le contrôle |
| Événements | `checkout.session.completed`, `checkout.session.payment_failed` | Seul `completed` est traité ; l'échec de paiement est ignoré |
| Expiration | Une session expire après 30 min **sans événement** `expired` | Une transaction restée `EN_ATTENTE` n'est jamais clôturée : il faut un rattrapage périodique qui relit la session |
| Délai de réponse | Réponse attendue en moins de 5 s, traitement asynchrone recommandé | La relecture chez Wave est faite avant de répondre |
| Remboursement | `POST /v1/checkout/sessions/:id/refund` existe | Non utilisé |
| Bac à sable | Non documenté ; exemples en clés de production | Pas de test possible contre l'API réelle sans compte |

## 4. Faisabilité des prestataires

| Prestataire | Constat | Fiabilité de la source |
|---|---|---|
| Wave (Business API, Checkout) | API documentée, authentifiée par clé liée à un compte Wave Business. **Disponibilité au Niger non confirmée** : une page partenaire tierce cite le Niger parmi dix pays, la fiche officielle de l'application cite six autres pays. Compte Business et vérification (KYC) nécessaires, délais annoncés par des sources commerciales : 3 à 10 jours ouvrés | Documentation Wave : fiable ; liste des pays : **non vérifiée** |
| NITA, Amana | **Aucune API publique trouvée.** Fonctionnement manuel : l'atelier paie hors plateforme, le SUPERADMIN confirme | Absence de résultat, pas preuve d'absence |
| Airtel Money, Moov, Orange Money (Niger) | Opérateurs dominants à Niamey d'après des blogs d'intégrateurs ; aucune documentation d'API officielle trouvée ; agrégateurs possibles | Sources commerciales : indicatives |

**Conclusion** : je ne peux pas garantir qu'un paiement en ligne soit utilisable au Niger. Avant d'écrire du code qui en dépend, il faut que **vous** obteniez la confirmation de Wave (pays, compte Business, frais). Le reste du système (souscription, cycle de vie, factures, rappels, tableau de bord) ne dépend pas de ce point et peut être construit autour d'un paiement **manuel vérifié** (déclaration de l'atelier, confirmation tracée du SUPERADMIN), avec Wave branchable ensuite.

## 5. Limites de cette analyse

- Les pages de documentation Wave ont été lues par un outil de lecture automatique ; les noms de champs ci-dessus sont à reconfirmer à l'implémentation.
- Aucune API de prestataire n'a été appelée.
- Les tarifs en base sont des valeurs temporaires de migration ; je n'ai pas lu les valeurs réelles de la base de production.

## 6. Décisions du 15/11/2026 et plan

| Décision | Choix |
|---|---|
| Paiement | **Manuel vérifié d'abord** : l'atelier déclare son paiement, le SUPERADMIN confirme, tout est tracé. Wave est préparé (conformité à la documentation, rattrapage, remboursement) mais **inactif** tant que Wave Business n'est pas confirmé au Niger |
| Après l'échéance | **Grâce puis lecture seule** : accès complet pendant `joursGrace` jours (7 par défaut, réglable 0 à 90 par le SUPERADMIN) avec bandeau, puis consultation et export seulement. Rien n'est supprimé. Abonnement suspendu : lecture seule immédiate |
| Limites par formule | Structure prévue (`PlanAbonnement.limites`, vide), **non appliquée** |

| Sous-phase | Contenu |
|---|---|
| 5.1 | Modèle de données (transactions manuelles, factures, abonnement suspendu, jours de grâce), état d'accès, renouvellement sans perte de jours |
| 5.2 | Souscription par l'atelier, déclaration de paiement, confirmation / rejet / remboursement par le SUPERADMIN, facture PDF |
| 5.3 | Application de la lecture seule (écritures refusées, lectures et exports conservés) |
| 5.4 | Rappels avant expiration et fin d'essai (courriel, une seule fois par échéance) |
| 5.5 | Wave durci (inactif par défaut) : événements dédoublonnés, verrou, échec de paiement, rattrapage des sessions expirées, remboursement ; testé contre un faux serveur Wave |
| 5.6 | Tableau de bord SUPERADMIN : revenus, renouvellements à venir, transactions |
| 5.7 | Interface : page Abonnement de l'atelier, écrans de confirmation du SUPERADMIN |
| 5.8 | Documentation et bilan |

## 7. Réalisé en 5.1

- Migration `20261117090000_abonnement_paiements_factures` : **additive**, rejouée sur une base contenant déjà un abonnement et une transaction (lignes inchangées, `atelierId` de la transaction déduit de son abonnement). Une seule transaction en attente par abonnement (index unique partiel) ; contraintes `CHECK` en `NOT VALID`.
- `lib/abonnement.js` : état `SUSPENDU`, `modeAcces()` (complet, grâce, lecture seule), `dateDebutSouscription()` (un renouvellement anticipé commence à l'échéance en cours, aucun jour perdu).
- 23 tests unitaires (`lib/__tests__/abonnement.test.js`), deux mutations détectées.
