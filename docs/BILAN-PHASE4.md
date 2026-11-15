# Bilan de la phase 4 — Qualité logicielle et industrialisation

Date des mesures : 15 novembre 2026. Tous les chiffres ci-dessous ont été relevés en exécutant les commandes indiquées, en local (Windows, Postgres 17 dans Docker). **Rien n'a été exécuté sur GitHub, Vercel ni Neon** : voir §7.

## 1. Synthèse

| | |
|---|---|
| Tests automatisés | **503** : 219 unitaires backend, 62 unitaires frontend, 7 de déploiement, 188 d'intégration (dont 1 `TODO` volontaire), 27 de bout en bout (E2E) |
| Résultat de la dernière exécution complète | 502 réussis, 0 échec, 1 `TODO` (anomalie métier connue, voir §6) |
| Défauts réels trouvés et corrigés pendant cette phase | **5** (§4) |
| Lint, build, audit des dépendances d'exécution | lint sans alerte, build correct, 0 vulnérabilité |
| Fonctionnalités métier modifiées | aucune volontairement ; 2 corrections de défauts (§4) |
| Branches | une par sous-phase (`phase4/4.1` à `4.9`), fusions `--no-ff` locales dans `main`, **rien poussé** |

## 2. Réponse aux 12 points de la mission

| # | Point | Livré | Preuve / document |
|---|---|---|---|
| 1 | Tests unitaires | 288 tests (backend 219, frontend 62, déploiement 7). Logique pure : argent, téléphones, transitions de statut, erreurs, journalisation, politique de déploiement | `npm test` ; `docs/TESTS.md` |
| 2 | Tests d'intégration | 188 tests contre un vrai Postgres : isolation entre ateliers, rôles, essai/abonnement, concurrence (paiements, reçus, livraisons, stock, comptes), idempotence, intégrité, sécurité, santé | `npm run test:integration` |
| 3 | Tests E2E (SUPERADMIN, PDG, CLIENT) | 27 parcours Playwright dans un navigateur réel : connexion, parcours de chaque rôle, permissions, isolation, garde CSRF | `npm run test:e2e` ; `e2e/specs` |
| 4 | Tests de régression | Pas de suite séparée : la régression est portée par l'ensemble ci-dessus, exécuté à chaque pull request, plus des tests ciblés sur les défauts trouvés (§4) et des garde-fous de dérive (§3) | `ci.yml` |
| 5 | Tests de sécurité | Intégration (`securite`, `role-boundaries`, `tenant-isolation`) et E2E (8 : 401, 403 par rôle, 404 d'isolation en lecture et écriture, CSRF, absence de fuite technique) ; `npm audit` | `docs/SECURITE.md` |
| 6 | Gestion d'erreurs uniforme | Classement central côté API, `requestId` sur toute 5xx, messages d'interface traduits, délai de requête de 40 s, référence de support affichée | `docs/ERREURS.md` |
| 7 | Logs structurés | Une ligne JSON par événement, journal d'accès, corrélation par `requestId`, aucune donnée personnelle ni corps de requête | `docs/JOURNALISATION.md` |
| 8 | Performances | Outil de mesure, jeu de données volumétrique, 3 optimisations chiffrées, 3 pistes écartées chiffrées | `docs/PERFORMANCES.md` |
| 9 | Documentation de l'API | 138 routes, accès, corps, conventions ; test qui échoue si le document diverge du code | `docs/API.md` |
| 10 | CI | Contrôle obligatoire `ci-ok`, tests par famille, cohérence schéma/migrations, audit, E2E non bloquant | `.github/workflows/ci.yml` |
| 11 | Déploiement Vercel sécurisé | Migrations appliquées **uniquement** par un build de production, interrupteur de secours, `DIRECT_URL` exigée en production, build en échec = ancien déploiement conservé | `docs/DEPLOIEMENT.md` |
| 12 | Versionnement Git et retour arrière | Branches par sous-phase, commits atomiques, fusions `--no-ff` (un `git revert -m 1` annule une sous-phase entière), table de retour arrière | `docs/DEPLOIEMENT.md` |

## 3. Tests disponibles et tests exécutés

| Famille | Disponibles | Exécutés le 15/11/2026 | Où ils tournent |
|---|---|---|---|
| Unitaires backend | 219 | 219 réussis | CI (`verifier`) |
| Unitaires frontend | 62 | 62 réussis | CI (`verifier`) |
| Déploiement | 7 | 7 réussis | CI (`verifier`) |
| Intégration | 188 | 187 réussis, 1 `TODO` | CI (`tests-integration`) |
| E2E | 27 | 27 réussis (aussi sur deux exécutions consécutives plus tôt) | CI (`tests-e2e`, **non bloquant**) |
| Cohérence schéma / migrations | 1 contrôle | écart détecté sur mutation, aucun écart sur le schéma réel | CI (`tests-integration`) |
| Audit des dépendances | 1 contrôle | 0 vulnérabilité | CI (`audit-dependances`, non bloquant) |

**Garde-fous de dérive** (un test échoue si deux endroits qui doivent rester alignés divergent) : transitions de statut frontend ↔ backend ; parité des clés de traduction fr/en ; `docs/API.md` ↔ routes du code ; politique de migration ↔ environnement Vercel.

**Qualité des tests vérifiée par mutation** (on casse le code, le test doit échouer) : correctif du doublon de téléphone retiré → l'E2E échoue ; garde CSRF désactivée → l'E2E échoue ; règle du « + » du numéro WhatsApp → test ajouté après qu'une première mutation n'avait pas été détectée ; ligne retirée ou renommée dans la documentation de l'API → test de cohérence en échec ; champ ajouté au schéma sans migration → contrôle de cohérence en échec (code 2).

## 4. Erreurs détectées pendant la phase (et leur traitement)

| # | Défaut | Détecté par | Traitement |
|---|---|---|---|
| 1 | Créer une cliente avec un téléphone déjà utilisé affichait « Une erreur inattendue est survenue » à la place du message (présent depuis le premier commit) | test E2E | Corrigé (`0c3d413`), côté interface seulement ; l'E2E échoue sans le correctif |
| 2 | Tableau de bord et notifications en erreur 500 au-delà d'environ 32 767 commandes payées dans un atelier (limite de paramètres PostgreSQL) | mesure de performance | Corrigé (`dc81d7b`), filtre `NOT EXISTS` ; test de caractérisation vert avant et après |
| 3 | Un build « Preview » Vercel pouvait appliquer les migrations sur la base de production | revue du déploiement | Corrigé (`e8c20de`) : migrations seulement si `VERCEL_ENV=production` |
| 4 | Panne réseau : l'interface n'affichait rien ; sans délai, une requête pouvait rester suspendue indéfiniment ; messages 5xx en français uniquement | revue des messages d'erreur | Corrigé (`8565187`) : types d'erreur, délai de 40 s, textes traduits, référence de support |
| 5 | Aucune trace par requête, et des journaux contenant des emails | revue de la journalisation | Corrigé (`7b4b741`) : journal d'accès structuré, emails remplacés par des identifiants |

Hors phase 4 mais exécutés avec le même socle de tests : les anomalies 1 à 3, 5, 6 et 8 du registre `docs/INVARIANTS.md` (concurrence, atomicité) sont résolues en 3.3.

## 5. Optimisations réalisées (chiffres dans `docs/PERFORMANCES.md`)

| Optimisation | Mesure |
|---|---|
| Impayées en `NOT EXISTS` | tableau de bord : 500 → 200 en 50 ms (gros atelier de 40 000 commandes) |
| Lectures d'authentification regroupées | 2 requêtes SQL de moins sur chaque route (ex. détail d'une commande : 9 → 7) |
| Chargement des pages à la demande | premier affichage : 715 ko → 420 ko (177 → 130 ko gzip) |

Écartées après essai : index sur la date des paiements (gros atelier 70 → 31 ms mais petit atelier 1,1 → 10 ms), index de recherche texte (23 ms, pas de migration justifiée), réécriture des notifications en SQL (93 ms, une fois par minute).

## 6. Anomalies connues, laissées ouvertes

| Anomalie | État | Décision attendue |
|---|---|---|
| Même téléphone dans deux ateliers : le second reçoit un 409 (identité de connexion globale). C'est le seul test `TODO` | OUVERTE, orientation validée, prévue en 3.7 | Reste à implémenter |
| Contraintes `CHECK` en base ajoutées en `NOT VALID` : elles refusent les nouvelles écritures invalides mais n'ont pas été validées sur les lignes existantes | ATTÉNUÉE | Lancer le pré-contrôle puis `VALIDATE CONSTRAINT` sur la base réelle |
| `GET /api/paiements` et `GET /api/livraisons` ne vérifient pas l'abonnement (lisibles après la fin de l'essai) | constat, code inchangé | Dire si c'est voulu |

## 7. Ce qui n'a pas été vérifié

- **Vercel** : le comportement réel (`VERCEL_ENV`, promotion, rollback) n'a jamais été exécuté ; la logique du script a été testée en local avec la variable simulée.
- **GitHub Actions** : le workflow est valide syntaxiquement (analyseur YAML) et chacune de ses commandes a été exécutée en local, mais il **n'a jamais tourné sur GitHub**. Le job E2E n'a jamais tourné sous Linux, d'où son statut non bloquant.
- **Neon** : aucune mesure ni migration n'a été faite sur la vraie base. Les temps de performance sont ceux d'un Postgres local : sans latence réseau, sans démarrage à froid.
- **Charge concurrente et réseau mobile** : non mesurés. Les tests de concurrence couvrent la justesse, pas le débit.
- **Couverture** : pas de tests de composants React, pas d'E2E sur l'inscription d'atelier, la livraison, le stock, les dépenses, l'abonnement ni l'impersonation (couverts par l'intégration seulement). Un seul navigateur (Chrome). Pas de test d'intrusion ni de fuzzing : les tests de sécurité vérifient les protections prévues, ils ne prouvent pas l'absence d'autres failles.
- **Mesure de couverture de code** : non faite (aucun chiffre de pourcentage n'est donné volontairement).

## 8. Procédures de déploiement en place

1. **Fusion** : pull request vers `main`, contrôle `ci-ok` vert (`verifier` + `tests-integration`). Si une migration est incluse : relire le SQL, créer un point de restauration Neon, lancer `scripts/preflight-contraintes.sql` pour les contraintes.
2. **Build Vercel** : `scripts/vercel-build.mjs` génère le client Prisma, migre **uniquement** en production (`prisma migrate status` puis `deploy`), puis construit le frontend. Un échec garde l'ancien déploiement actif.
3. **Interrupteur de secours** : `SKIP_MIGRATIONS=1`.
4. **Retour arrière** : table dans `docs/DEPLOIEMENT.md` (code : promotion du déploiement précédent ; migration : corrective, jamais annulée en place ; données : restauration Neon à un instant précis ; Git : `git revert -m 1` sur la fusion).
5. **Mesures et supervision** : `GET /api/health` (processus) et `GET /api/health/ready` (base) ; journaux JSON corrélés par `requestId`.

## 9. Actions qui vous reviennent (non faisables depuis le dépôt)

1. **GitHub → règle de branche sur `main`** : pull request obligatoire, contrôle `ci-ok` obligatoire, pas de contournement. Sans cela, un push direct déploie même si la CI est rouge.
2. **Avant le premier `git push`** : créer un point de restauration Neon. `main` contient la migration `20261116140000_cle_idempotence` et celle des contraintes `CHECK`, qui s'appliqueront au premier build de production.
3. **Vercel** : `DIRECT_URL` en Production uniquement ; une branche Neon distincte pour Preview ; `CRON_SECRET`, `JWT_SECRET`, `DATABASE_URL`, `RESEND_*` en Production.
4. **Après la première exécution verte de `tests-e2e` sur GitHub** : retirer `continue-on-error` et ajouter ce job à `needs` de `ci-ok`.
5. **Au premier déploiement** : relever sur Vercel + Neon le temps de `GET /api/commandes` (champ `dureeMs`) et le comparer à `docs/PERFORMANCES.md`.
6. Décider du sort des trois points du §6.
