# Idempotence des écritures (en-tête `Idempotency-Key`)

Sous-phase 3.3. Un client peut répéter une requête d'écriture (double clic, réseau coupé, délai dépassé)
sans risquer de l'exécuter deux fois. Avant : 8 paiements, commandes ou dépenses identiques créaient 8
enregistrements ; 5 activations d'abonnement simultanées en créaient 7 (mesuré).

## Contrat

L'en-tête `Idempotency-Key` est **optionnel**. Valeur : 8 à 128 caractères parmi lettres, chiffres,
`- _ . :` (un UUID convient). Le client la génère pour **une opération logique** et la conserve tant que
l'opération n'a pas abouti ; il en génère une nouvelle pour l'opération suivante.

| Situation | Réponse |
|---|---|
| Première requête avec cette clé | exécutée normalement ; si elle réussit (2xx), la réponse est mémorisée |
| Même clé, **même** requête (méthode, chemin, corps), déjà terminée | **la réponse d'origine est rejouée** (même statut, même corps), en-tête `Idempotent-Replay: true` ; rien n'est ré-exécuté |
| Même clé, requête **différente** | `422` « Cette clé d'idempotence a déjà été utilisée avec une requête différente. » |
| Même clé, requête identique **en cours de traitement** | `409` « …déjà en cours de traitement » + `Retry-After: 1` |
| Clé mal formée | `400`, rien n'est exécuté |
| **Sans en-tête** | comportement historique **inchangé** |

### Ce qui est mémorisé

**Seules les réponses 2xx.** Un refus (4xx) ou une erreur serveur (5xx) supprime la réservation : le
réessai est **réévalué**. Raison : un refus « le paiement dépasse le solde » peut devenir faux après une
annulation ; une panne temporaire ne doit pas être rejouée.

### Durées

| Élément | Durée |
|---|---|
| Vie d'une clé terminée | **24 h**, puis la requête est traitée comme nouvelle |
| Traitement « en cours » sans réponse | **60 s**, puis repris (plantage en cours de traitement) |
| Purge | quotidienne, par le cron des rappels (`clesIdempotencePurgees` dans sa réponse) |

### Portée et isolation

Une clé est **scopée** : `atelier:<id>` (ADMIN, y compris en impersonation) ou `superadmin:<id>`. La même
clé utilisée par deux ateliers est indépendante : la réponse d'un atelier n'est jamais rejouée à un autre.

## Garanties de fonctionnement

- **Réservation atomique** : contrainte `UNIQUE (portee, cle)` ; sous requêtes simultanées une seule
  l'emporte, les autres rejouent ou reçoivent le 409 « en cours ».
- **Enregistrement avant envoi** : la réponse est mémorisée **avant** d'être envoyée au client ; un réessai ne
  peut donc jamais voir « en cours » une opération déjà terminée dont le client a reçu la réponse.
- Un échec d'écriture de la mémoire est journalisé et ne bloque jamais la réponse.

## Opérations protégées (7)

`POST /api/commandes` · `POST /api/commandes/:id/paiements` · `POST /api/commandes/:id/livraisons`
(avec paiement final éventuel) · `POST /api/stock/:id/mouvements` · `POST /api/depenses` ·
`POST /api/clientes` · `POST /api/ateliers/:id/abonnement/activer` (SuperAdmin).

## Limites connues

- **L'interface ne transmet pas encore de clé** : la protection est opérationnelle côté API mais dormante
  tant que le frontend n'en envoie pas (câblage prévu en sous-phase 3.6).
- **Sans clé, aucune protection.** C'est vrai aussi pour l'activation d'abonnement : la règle de
  renouvellement (début = fin de la période active) et une garde naturelle contre le double clic relèvent du
  lot F de la phase « Consolidation métier ».
- Un corps de requête qui diffère seulement par l'ordre des clés JSON est considéré identique ; une valeur
  différente (ex. `"1000"` contre `1000`) est une requête différente.
- Les réponses mémorisées sont stockées en base (colonne JSON) pendant 24 h : elles contiennent des données
  métier de l'atelier, supprimées à l'expiration.

## Mise en œuvre

`backend/src/lib/idempotence.js` (middleware et purge) · table `CleIdempotence`
(migration `20261116140000_cle_idempotence`, purement additive) · tests : `integration-tests/idempotence.test.js`.
