# Bilan de la phase 5 — Monétisation et commercialisation

Mesures du 15 novembre 2026, relevées en exécutant les commandes indiquées, en local (Windows, Postgres 17 dans Docker). **Rien n'a été exécuté sur GitHub, Vercel, Neon, Wave ni Resend.** Documents liés : [ABONNEMENTS.md](ABONNEMENTS.md) (référence), [PHASE5-ANALYSE.md](PHASE5-ANALYSE.md) (analyse, décisions, détail par sous-phase), [API.md](API.md).

## 1. Synthèse

| | |
|---|---|
| Ce qui fonctionne | essai de 15 jours, souscription par déclaration de paiement, vérification et confirmation par le SUPERADMIN, factures PDF, remboursements, renouvellement sans perte de jours, grâce puis lecture seule, rappels par courriel, tableau de bord commercial, interface atelier et SUPERADMIN |
| Ce qui est préparé mais **inactif** | paiement Wave (webhook, relecture serveur, rattrapage, remboursement) |
| Ce qui **ne peut pas** être fait par le code | vérifier un paiement mobile money (aucune API d'opérateur disponible) : le rapprochement est humain |
| Tests de la suite | **693** : 302 unitaires backend, 80 frontend, 7 déploiement, 269 d'intégration (dont 1 `TODO` volontaire), 35 de bout en bout. Dernière exécution : 692 réussis, 0 échec, 1 `TODO` |
| Ajoutés pendant la phase | +83 unitaires backend, +18 frontend, +81 d'intégration, +8 de bout en bout |
| Migrations | 4 nouvelles, **toutes additives**, rejouées sur une base peuplée (lignes existantes inchangées) |
| Routes | 138 → 157, documentées et vérifiées par test |
| Lint, audit des dépendances d'exécution | propre, 0 vulnérabilité |

## 2. Les 12 points de la mission

| # | Point | État | Remarque |
|---|---|---|---|
| 1 | Offres d'abonnement | **Partiel** | Structure complète (formules, prix mensuels, remises par durée, durées 1 à 60 mois). **Limites chiffrées : structure prévue, non appliquée** (décision du 15/11). **Les tarifs sont à fixer par vous** : valeurs de départ non vérifiées |
| 2 | Essai gratuit | **Fait** | 15 jours posés à l'inscription, évalués à chaque requête, rappels à 3 et 1 jours. Ateliers antérieurs jamais restreints |
| 3 | Souscription | **Fait** | Par déclaration de paiement ; Wave prêt mais inactif |
| 4 | Cycle de vie | **Fait** | Actif, en attente, expiré, suspendu (nouveau), renouvelé (chaîne), annulé ; états dérivés des dates, donc sans dérive possible |
| 5 | Paiements | **Partiel** | Manuel vérifié : fait. Wave : intégré, **jamais essayé en réel**, disponibilité au Niger non confirmée. NITA / Amana / Airtel / Moov / Orange : aucune API publique trouvée |
| 6 | Vérification côté serveur | **Fait** | Jamais de confirmation sur la foi du navigateur ; Wave : relecture chez Wave avec comparaison session, référence, montant, devise |
| 7 | Webhooks | **Fait (testé contre un faux serveur)** | Signature HMAC sur le corps brut, tolérance 5 min, événements dédoublonnés, 503 pour redemander une livraison |
| 8 | Factures | **Partiel** | Justificatif PDF numéroté, immuable, annulé en cas de remboursement. **Sans mentions légales** (identifiant fiscal, registre, siège) : je ne les connais pas |
| 9 | Renouvellements et rappels | **Fait** | Renouvellement anticipé sans perte de jours ; rappels J-7/3/1 et fin de période, un seul par échéance |
| 10 | Impayés | **Fait, règles simples** | Grâce puis lecture seule ; pas de pénalité ni de relance au-delà des rappels |
| 11 | Limitation des accès | **Fait** | Lecture seule : consultation et exports conservés, aucune donnée supprimée ni masquée |
| 12 | Tableau de bord SUPERADMIN | **Fait** | Ateliers par état et par accès, revenus (mois, cumul, revenu récurrent), renouvellements, conversion, paiements à vérifier, anomalies |

## 3. Consignes de la mission

| Consigne | Comment elle est tenue |
|---|---|
| Analyser d'abord l'existant | `PHASE5-ANALYSE.md` §1 à §4, avant tout code |
| Jamais de paiement confirmé sur la foi du frontend | Testé : un « retour » du navigateur ne confirme rien ; une déclaration n'accorde aucun accès |
| Doubles transactions et confirmations répétées | Une transaction en attente par abonnement (index unique) ; clé d'idempotence ; confirmations simultanées ou rejouées = une activation, une facture (testé, mutation détectée) |
| Traçabilité financière | Historique par abonnement, journal de sécurité, auteurs et dates de chaque décision |
| Échec, annulation, remboursement | Rejet, retrait, expiration, remboursement ; pannes de Wave et du courriel sans effet sur la décision |
| Vérifier les prestataires avant de les utiliser | Documentation Wave lue le 14/11/2026 ; Niger non confirmé ; aucune API pour les autres |
| Ne pas modifier arbitrairement les abonnements existants | Migrations additives ; ateliers sans échéance d'essai jamais restreints ; **un changement de comportement volontaire** : voir §5 |

## 4. Tests de la phase

| Famille | Ce qui est couvert |
|---|---|
| Unitaires (dates fixes) | états et accès, renouvellement, rappels, signature Wave, évaluation d'une session, indicateurs commerciaux |
| Intégration (vraie base) | souscription, confirmation, rejet, remboursement, isolation, concurrence, lecture seule (13 écritures refusées, 21 lectures acceptées), rappels (Resend simulé), Wave (faux serveur : doublons, falsification, pannes, rattrapage), revenus et renouvellements en SQL |
| De bout en bout (navigateur réel) | grâce, lecture seule, souscription, confirmation par le SUPERADMIN, accès rétabli, justificatif PDF, isolation du justificatif, tableau de bord, réglages |
| Mutations | détectées : confirmation sans verrou, sans garde de rejeu, écritures autorisées en lecture seule, grâce ignorée, confiance au contenu du webhook, montant non contrôlé, Wave toujours actif, signature non vérifiée, rappel non libéré, rappel en double, revenu récurrent comptant les suspendus |

## 5. Changements de comportement par rapport à avant

- **Fin d'essai ou d'abonnement** : avant, toute requête recevait 402, **lecture comprise**. Maintenant : grâce de 7 jours (accès complet) puis **lecture seule** (consultation et exports). Deux tests existants ont été modifiés en conséquence.
- `/api/webhooks/wave` répondait 404 (non monté) ; il répond désormais 503 tant que Wave n'est pas activé.
- `/api/ateliers/tendances` datait un revenu de la dernière modification de la transaction ; il utilise la date de confirmation.
- Le code dormant `lib/payments/` (jamais appelé) est supprimé.

## 6. Défauts trouvés pendant la phase

| Défaut | Détecté par | Traitement |
|---|---|---|
| Un atelier dont l'abonnement échoit ne pouvait plus **lire ni exporter ses propres données** | analyse | Lecture seule |
| Renouveler un abonnement encore actif aurait **fait perdre les jours restants** | analyse | Début à l'échéance en cours |
| Webhook Wave : événements non dédoublonnés, état non relu sous verrou, échec de paiement ignoré, sessions expirées jamais closes | comparaison à la documentation Wave | Durcissement (5.5) |
| Un renouvellement démarrant quelques millisecondes après l'échéance n'était pas reconnu : **rappel d'expiration envoyé à tort** | suite d'intégration en parallèle | Continuité tolérée à un jour |
| Montants issus du SQL écrits `27000.00` alors que le reste de l'API écrit `27000` | test d'intégration | Format unique |
| Après une déclaration, le message de confirmation n'apparaissait pas (rappel de la mutation jamais appelé) | test de bout en bout | Relecture de l'état non attendue |
| Revenu des tendances daté par `updatedAt` | revue | Date de confirmation |

## 7. Ce qui n'a pas été vérifié

- **Wave réel** : aucun appel à l'API Wave. Le faux serveur applique ma lecture de la documentation ; si elle diffère (champs, statuts, signature), les tests passent quand même. Disponibilité au Niger : **non confirmée**.
- **Neon / Vercel** : les 4 migrations de la phase 5 (et les 2 de la phase 4) n'ont pas été appliquées à la vraie base ; le comportement en production est inconnu.
- **Courriels** : jamais envoyés pour de vrai ; domaine d'expédition non configuré.
- **Interface** : testée en français dans un navigateur de bureau (Chrome). Pas de test sur mobile, pas d'audit d'accessibilité, **textes anglais non relus par un locuteur natif**. Le parcours Wave n'est pas testé dans un navigateur.
- **Données réelles** : je n'ai pas lu vos formules, vos prix ni vos abonnements de production. L'effet du passage de « blocage total » à « lecture seule » sur vos ateliers réels n'a pas été observé.
- **Charge** : aucun test de volume sur les nouvelles routes ; le tableau de bord commercial charge tous les ateliers en mémoire (adapté à quelques centaines).
- **Aspects juridiques et fiscaux** : le justificatif n'est pas une facture légale ; la conformité (fiscalité, conditions de vente, remboursement, protection des données) n'a pas été examinée.

## 8. Anomalies et décisions laissées ouvertes

| Sujet | État |
|---|---|
| Même téléphone dans deux ateliers (`TODO`) | Ouvert depuis la phase 3 (orientation validée, prévue en 3.7) |
| Contraintes `CHECK` en `NOT VALID` | Non validées sur les lignes existantes (voir phase 4) |
| `GET /api/paiements` et `GET /api/livraisons` ne vérifient pas l'abonnement | Constat de la phase 4, code inchangé ; en lecture seule ils restent lisibles, ce qui est cohérent avec la nouvelle règle |
| Limites chiffrées par formule | Structure prévue, non appliquée |
| Table `FormuleAbonnement` (ancien modèle « formule = durée ») | Conservée, non utilisée par le nouveau parcours |

## 9. Actions qui vous reviennent

1. **Fixer les tarifs** (Tarification) et **saisir les instructions de paiement** (Tableau commercial → Réglages) avant d'ouvrir la souscription.
2. **Compléter les mentions légales** du justificatif (`lib/facturePdf.js`, `EMETTEUR`) avec votre conseil comptable ; décider si « justificatif » suffit ou s'il faut une facture légale.
3. **Configurer l'envoi de courriels** : domaine vérifié chez Resend, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `PUBLIC_APP_URL`.
4. **Avant de pousser** : point de restauration Neon (6 migrations en attente : 2 de la phase 4, 4 de la phase 5), règle de branche `ci-ok` (voir `BILAN-PHASE4.md` §9).
5. **Premier cycle réel** avec un atelier test : déclarer, confirmer, télécharger le justificatif, rembourser, vérifier les courriels.
6. **Wave** : contacter Wave (pays, compte Business, frais) ; n'activer qu'après un essai réel d'un très petit montant (`ABONNEMENTS.md` §10).
7. **Décider** : durée de grâce (7 jours par défaut), limites par formule, politique de remboursement (seul le total est géré), facturation récurrente automatique (non prévue).
8. **Faire relire** les textes anglais ; tester l'interface sur téléphone.
