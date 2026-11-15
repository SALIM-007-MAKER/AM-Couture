# Invariants financiers et règles de séquencement

Contrat vérifié par les tests de concurrence (`backend/src/integration-tests/concurrence-*.test.js`,
utilitaire `invariants.js`). Il décrit ce que le système **garantit aujourd'hui**, ce qu'il
**ne garantit pas**, et les écarts connus. Sous-phase 3.1 : aucun comportement applicatif n'a
été modifié pour l'écrire.

## 1. Invariants vérifiés après chaque scénario concurrent

| Id | Invariant | Mécanisme actuel |
|---|---|---|
| I1 | Pour chaque commande, somme des paiements non annulés ≤ `prixTotal` | Verrou `SELECT … FOR UPDATE` sur la commande + contrôle du solde dans la transaction |
| I2 | Tout paiement a un montant > 0 | Validation applicative (aucune contrainte `CHECK` en base) |
| I3 | Au plus une livraison active (non annulée) par commande | Verrou sur la commande + test « déjà livrée » |
| I4 | `statut = LIVREE` ⇔ il existe une livraison active | Création et annulation dans la transaction qui change le statut |
| I5 | Au plus un reçu par paiement ; aucun reçu ne référence un paiement annulé | `UNIQUE(paiementId)` pour le premier ; le second est une **course ouverte** (voir §4) |
| I6 | Le montant d'un reçu ≤ `prixTotal` de sa commande | Calculé côté serveur à l'émission |
| I7 | Quantité en stock ≥ 0 pour chaque article | Verrou sur l'article + contrôle avant sortie |
| I8 | Les événements clients sont cohérents avec les écritures : un événement `PAIEMENT_ENREGISTRE` par paiement créé, un `COMMANDE_CREEE` par commande, un `LIVRAISON_ENREGISTREE` par livraison active ou annulée | Insertion dans la même transaction que l'écriture |
| I9 | Numéros de commande, de reçu : uniques sur toute la plateforme | Contrainte `UNIQUE` en base |

## 2. Règles de séquencement des numéros (`nextNumero`, `lib/numero.js`)

Format : `PRÉFIXE-AAAA-NNNN`. Un compteur par couple (préfixe, année UTC), partagé par
**tous** les ateliers.

| Règle | Énoncé | Garantie actuelle |
|---|---|---|
| R1 | Unicité : deux documents ne reçoivent jamais le même numéro, même sous requêtes simultanées | **Garantie** (UPSERT atomique + `UNIQUE`) |
| R2 | Continuité globale : les numéros engagés (transactions validées) d'un même compteur forment une suite sans trou 1…N | **Garantie** tant que seule l'application écrit le compteur |
| R3 | Une transaction annulée (rollback) ne consomme pas de numéro | **Garantie** : l'incrément est dans la même transaction |
| R4 | Les compteurs de préfixes différents sont indépendants | **Garantie** |
| R5 | Continuité **par atelier** | **NON garantie** : le compteur est global, un atelier voit des numéros non consécutifs (écart connu, objet de la sous-phase 3.4) |
| R6 | L'ordre numérique reflète l'ordre d'arrivée des requêtes | **NON garantie** : seul l'ordre de validation des transactions compte |
| R7 | Pas de trou après restauration de sauvegarde, modification manuelle du compteur ou suppression manuelle d'un document | **NON garantie** (hors périmètre applicatif) |
| R8 | Remise à zéro annuelle | L'année est prise en UTC : un document créé juste après minuit local d'un fuseau ≠ UTC peut porter l'année précédente ou suivante |

> Conséquence : l'absence de trou n'est affirmée que pour R2 et R3, dans les conditions
> listées. Elle ne doit pas être présentée à un atelier comme une garantie comptable avant la 3.4.

## 3. Comportement sous requêtes répétées

| Cas | Comportement actuel |
|---|---|
| Même paiement envoyé deux fois | **Deux paiements** sont créés si le solde le permet (aucune clé d'idempotence) — écart 2.2, sous-phase 3.3 |
| Même transition de statut envoyée N fois en parallèle | Un seul succès, les autres reçoivent 409 (`updateMany` conditionnel) |
| Annulation du même paiement / de la même livraison N fois | Un seul succès, les autres reçoivent 409 |
| Reçu du même paiement N fois | Un seul succès, les autres reçoivent 409 |
| Livraison de la même commande N fois | Un seul succès, les autres reçoivent 409 |

## 4. Anomalies : état

Un test `todo` décrit le comportement **attendu** ; il échoue tant que l'anomalie est ouverte et
ne fait pas échouer la CI. **Une anomalie n'est fermée que lorsque son test est devenu bloquant et
a été vérifié stable** — jamais simplement parce qu'il est marqué `todo`. Résultats **mesurés**
(Postgres 16 et 17).

| # | Anomalie | Mesure initiale (3.1) | État | Sous-phase |
|---|---|---|---|---|
| 1 | Reçu émis sur un paiement annulé quand annulation et émission arrivent en même temps (I5) | 25 tours sur 25 : une violation à chaque tour | **OUVERTE** (test `todo` qui échoue) | 3.3 |
| 2 | Invitations simultanées de la même cliente | 5 requêtes → 1 succès, 1 refus 409, **3 erreurs 500** | **CORRIGÉE en 3.2** : les perdantes reçoivent 409 (classement central de `P2002`). Test **bloquant**, 15 exécutions consécutives sans échec | 3.2 |
| 3 | Inscriptions simultanées avec le même email | 5 requêtes → 1 succès, **4 erreurs 500** | **CORRIGÉE en 3.2** (même cause). Test **bloquant**, stable. Le message est générique (« Un enregistrement identique existe déjà ») : un message précis par champ reste possible plus tard | 3.2 |
| 4 | Même téléphone dans deux ateliers | le second atelier reçoit 409 « compte déjà existant » | **OUVERTE** (test `todo` qui échoue) : identité de connexion globale à revoir, orientation validée | 3.7 |

La correction 2/3 traite le **symptôme visible** (500 → 409). La cause profonde — une vérification
« existe déjà ? » suivie d'une création, sans atomicité — subsiste ; la sous-phase 3.3 la traitera
avec l'idempotence. L'invariant de données (un seul compte, un seul atelier, aucun orphelin) tenait
déjà et reste vérifié.

Comportements **caractérisés** (le test affirme l'état actuel, à inverser dans la sous-phase
indiquée) : absence d'idempotence des paiements (3.3), numérotation globale non continue par
atelier (3.4).

## 5. Efficacité des tests : vérification par mutation

Pour s'assurer que ces tests détectent vraiment une régression, huit défauts ont été introduits
**temporairement** dans le code applicatif (un à la fois, puis annulés avec Git). Tous ont été
détectés :

| Mutation | Fichier de tests qui échoue |
|---|---|
| Verrou `FOR UPDATE` retiré de la création de paiement | paiements (8 échecs) |
| Contrôle du solde retiré du paiement | paiements (8 échecs) |
| Événement client retiré de la transaction de paiement (I8) | paiements (8 échecs) |
| Verrou `FOR UPDATE` retiré de la création de livraison | reçus-livraisons (3 échecs) |
| Verrou `FOR UPDATE` retiré du mouvement de stock | stock (6 échecs) |
| Contrôle de quantité insuffisante retiré du stock | stock (7 échecs) |
| Transition de statut rendue non conditionnelle | commandes-numéros (2 échecs) |
| Compteur de numéros rendu non atomique (lecture puis écriture) | commandes-numéros (6 échecs) |

## 6. Conventions de la suite

- Tout passe par l'API réelle : une écriture directe en base contournerait les verrous et les
  événements que ces tests vérifient.
- Chaque scénario se termine par `toutesViolations(atelier)` (invariants I1 à I8).
- Les scénarios qui produisent volontairement des données incohérentes (défauts connus) utilisent
  leur propre atelier, nettoyé ensuite.
- Les IP de test sont uniques par processus : le limiteur de débit garde ses compteurs en base.
