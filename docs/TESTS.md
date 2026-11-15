# Tests : inventaire et exécution

| Niveau | Où | Outil | Commande | Effectif (15/11/2026) | Dans la CI |
|---|---|---|---|---|---|
| Unitaires backend | `backend/src/**/__tests__` | `node --test` | `npm test` | 329 (dont 4 de cohérence de `docs/API.md`) | oui (`verifier`) |
| Unitaires frontend | `frontend/src/**/__tests__` | `node --test` | `npm test` | 94 | oui (`verifier`) |
| Déploiement | `scripts/__tests__` | `node --test` | `npm test` | 7 | oui (`verifier`) |
| Intégration (API + Prisma + Postgres) | `backend/src/integration-tests` | `node --test` | `npm run test:integration` | 304 (303 + 1 `TODO` volontaire) | oui (`tests-integration`) |
| End-to-end (navigateur réel → frontend → API → Postgres) | `e2e/specs` | Playwright | `npm run test:e2e` | 39 | job `tests-e2e`, **non bloquant** (jamais exécuté sur GitHub) |
| Cohérence schéma Prisma / migrations | `prisma/` | `prisma migrate diff` | voir `.github/workflows/ci.yml` | 1 contrôle | oui (`tests-integration`) |
| Vulnérabilités des dépendances d'exécution | `package-lock.json` | `npm audit --omit=dev` | `npm audit --omit=dev --audit-level=high` | 0 constaté le 15/11/2026 | job `audit-dependances`, non bloquant |

**Contrôle obligatoire de la CI : `ci-ok`** (= `verifier` + `tests-integration`). C'est lui qu'il faut exiger dans la protection de branche de `main` ; voir `docs/DEPLOIEMENT.md`, « Porte de déploiement ».

`npm test` à la racine enchaîne backend, frontend et déploiement. Aucune dépendance de test n'est ajoutée : le
lanceur natif de Node suffit pour la logique pure.

## Tests d'intégration en local

`TEST_DATABASE_URL` est obligatoire (le préchargement refuse de démarrer sans, pour ne jamais toucher Neon).
Avec Docker :

```
docker run -d --name am-test-pg -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=gestion_atelier_test -p 55432:5432 postgres:17
DATABASE_URL=postgresql://test:test@localhost:55432/gestion_atelier_test \
DIRECT_URL=postgresql://test:test@localhost:55432/gestion_atelier_test npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://test:test@localhost:55432/gestion_atelier_test npm run test:integration
```

## Tests de bout en bout (local)

Prérequis : Chrome installé (Playwright l'utilise, aucun navigateur à télécharger) et une base Postgres **dédiée dont
le nom contient « e2e »** — le seed la **vide** à chaque exécution et refuse toute base non locale ou sans « e2e ».

```
docker exec am-test-pg psql -U test -d postgres -c "CREATE DATABASE gestion_atelier_e2e"
DATABASE_URL=postgresql://test:test@localhost:55432/gestion_atelier_e2e DIRECT_URL=postgresql://test:test@localhost:55432/gestion_atelier_e2e npx prisma migrate deploy
E2E_DATABASE_URL=postgresql://test:test@localhost:55432/gestion_atelier_e2e npm run test:e2e
```

Les ports 4000 (API) et 5173 (Vite) doivent être libres : les serveurs sont lancés et arrêtés par Playwright.
Jeu de données : `e2e/seed.js` (1 SUPERADMIN ; ateliers Alpha et Beta avec leur PDG ; une cliente avec compte et
commande acomptée dans Alpha ; une cliente et une commande dans Beta pour prouver l'isolation). En cas d'échec :
captures et traces dans `e2e-resultats/` (`npx playwright show-trace <trace.zip>`).

| Fichier | Parcours |
|---|---|
| `auth.spec.js` | accès sans session, mauvais mot de passe, connexion du PDG |
| `superadmin.spec.js` | liste et fiche des ateliers, vue d'ensemble, écrans métier fermés |
| `pdg.spec.js` | création de cliente, doublon de téléphone, règle « pas de commande sans mesure », commande + paiement (le solde diminue), refus d'un paiement supérieur au solde, isolation, espace plateforme fermé |
| `client.spec.js` | profil, commande avec payé / reste, aucune donnée d'un autre atelier, espace de gestion fermé |
| `securite.spec.js` | 401 sans session, 403 par rôle, 404 sur les ressources d'un autre atelier (lecture et écriture), garde d'origine (CSRF), erreurs sans fuite technique |
| `abonnement.spec.js` | période de grâce, lecture seule avec saisie refusée, souscription (instructions, référence obligatoire, une seule déclaration à la fois), confirmation par le SUPERADMIN, accès rétabli, justificatif PDF (non accessible à un autre atelier), tableau de bord commercial, réglages |

Limites : une seule connexion par rôle (session réutilisée) pour rester sous le limiteur de débit ; un seul navigateur
(Chrome) ; pas de parcours d'inscription d'un atelier, de livraison, de stock, de dépenses, d'abonnement ni
d'impersonation (couverts seulement par les tests d'intégration).

## Ce que couvrent les tests frontend

- Classement des erreurs réseau / délai / 5xx et messages affichés (`lib/errorMessage.js`, `lib/apiClient.js`).
- **Parité des transitions de statut avec le backend** : la copie frontend ne peut plus dériver sans faire échouer le test.
- **Parité fr/en des traductions** : clés manquantes ou orphelines, traductions vides, variables `{{x}}` divergentes.
- Messages et numéros WhatsApp (indicatif, « + », statuts livrés/annulés, devise), formats de prix et de date, mots de passe générés, construction des query-strings.

Les calculs financiers (totaux, soldes, statut de paiement) sont **côté serveur** (`backend/src/lib/money.js`, testés
en unitaire et en intégration) ; le frontend n'en refait aucun, il affiche les montants reçus.

## Non couvert (à ne pas présumer)

- Rendu des composants React isolés : aucun test unitaire (pas de jsdom). Les parcours E2E ci-dessus les exercent en conditions réelles, sur un périmètre limité.
- Pages longues (`AtelierDetailPage`, `RapportsPage`, `CommandeFormPage`) : logique mêlée au JSX, non testable unitairement sans refonte.
- Compression d'image (`lib/imageFile.js`) : exige un navigateur (canvas).
