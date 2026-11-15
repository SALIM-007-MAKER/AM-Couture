# Tests : inventaire et exécution

| Niveau | Où | Outil | Commande | Effectif (15/11/2026) | Dans la CI |
|---|---|---|---|---|---|
| Unitaires backend | `backend/src/**/__tests__` | `node --test` | `npm test` | 215 | oui (`verifier`) |
| Unitaires frontend | `frontend/src/**/__tests__` | `node --test` | `npm test` | 59 | oui (`verifier`) |
| Déploiement | `scripts/__tests__` | `node --test` | `npm test` | 7 | oui (`verifier`) |
| Intégration (API + Prisma + Postgres) | `backend/src/integration-tests` | `node --test` | `npm run test:integration` | 186 (185 + 1 `TODO` volontaire) | oui (`tests-integration`) |
| End-to-end (parcours navigateur) | — | — | — | **0 : à faire (4.5)** | non |

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

## Ce que couvrent les tests frontend

- Classement des erreurs réseau / délai / 5xx et messages affichés (`lib/errorMessage.js`, `lib/apiClient.js`).
- **Parité des transitions de statut avec le backend** : la copie frontend ne peut plus dériver sans faire échouer le test.
- **Parité fr/en des traductions** : clés manquantes ou orphelines, traductions vides, variables `{{x}}` divergentes.
- Messages et numéros WhatsApp (indicatif, « + », statuts livrés/annulés, devise), formats de prix et de date, mots de passe générés, construction des query-strings.

Les calculs financiers (totaux, soldes, statut de paiement) sont **côté serveur** (`backend/src/lib/money.js`, testés
en unitaire et en intégration) ; le frontend n'en refait aucun, il affiche les montants reçus.

## Non couvert (à ne pas présumer)

- Rendu des composants React et interactions : aucun test (pas de jsdom ni de navigateur). Les E2E du point 4.5 les couvriront.
- Pages longues (`AtelierDetailPage`, `RapportsPage`, `CommandeFormPage`) : logique mêlée au JSX, non testable unitairement sans refonte.
- Compression d'image (`lib/imageFile.js`) : exige un navigateur (canvas).
