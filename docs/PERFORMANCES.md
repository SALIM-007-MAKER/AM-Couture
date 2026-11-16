# Performances — mesures, corrections et limites

Ce document rend compte de la mesure faite en phase 4.6. Chaque optimisation retenue s'appuie sur un chiffre ; celles qui ont été essayées puis écartées sont listées avec leur chiffre.

## 1. Méthode

- **Jeu de données** (`scripts/perf/seed-volume.sql`) : un gros atelier (5 000 clientes, 40 000 commandes, 75 000 paiements, 28 000 livraisons, 10 000 dépenses) et 40 petits ateliers (100 clientes, 200 commandes chacun). C'est volontairement bien au-delà d'un atelier réel : le but est de trouver où le code ne passe plus à l'échelle.
- **Mesure** (`scripts/perf/mesure.mjs`) : démarre l'application Express dans le processus, se connecte comme PDG du gros atelier et appelle 25 routes en lecture. Pour chacune : durée de bout en bout (médiane), nombre de requêtes SQL, temps SQL cumulé, requête la plus lente. Les requêtes SQL sont comptées en interceptant `pg.Client.query` : aucun code de production n'est instrumenté.
- **Garde-fous** : le script refuse toute base qui n'est pas locale ou dont le nom ne contient pas `perf`.

```bash
# Base jetable dans le conteneur Postgres local (voir docs/TESTS.md)
docker exec am-test-pg psql -U test -d postgres -c "CREATE DATABASE gestion_atelier_perf"
export URL=postgresql://test:test@localhost:55432/gestion_atelier_perf
DATABASE_URL=$URL DIRECT_URL=$URL npx prisma migrate deploy
MSYS_NO_PATHCONV=1 docker cp scripts/perf/seed-volume.sql am-test-pg:/tmp/seed.sql
MSYS_NO_PATHCONV=1 docker exec am-test-pg psql -U test -d gestion_atelier_perf -v ON_ERROR_STOP=1 -f /tmp/seed.sql
PERF_DATABASE_URL=$URL npm run perf   # PERF_REPETITIONS=5 par défaut, PERF_SORTIE=fichier.json pour garder le détail
```

## 2. Ce que la mesure a trouvé

### 2.1 Panne au volume : tableau de bord et notifications en erreur 500 (corrigé)

Sur le gros atelier, `GET /api/dashboard/summary`, `GET /api/notifications` et `GET /api/notifications/nombre-non-lues` répondaient **500** (`P2029 : The query parameter limit supported by your database is exceeded`).

- **Cause** : la définition de « commande impayée » (`lib/commandesImpayees.js`) lisait les identifiants de toutes les commandes ayant un paiement, puis les passait en `notIn`. PostgreSQL limite une requête à 32 767 paramètres : au-delà de ce nombre de commandes payées, la requête échoue. Même sous la limite, tout l'historique de paiements était relu à chaque appel (57 ms sur 75 000 paiements).
- **Correction** : un filtre relationnel `paiements: { none: { annuleAt: null } }`, que Prisma traduit en `NOT EXISTS`. Rien n'est chargé en mémoire.
- **Garde-fou** : `integration-tests/commandes-impayees.test.js` fixe la définition (sans paiement, paiement annulé seul, commande annulée, paiement d'un autre atelier). Il passe avec l'ancienne et la nouvelle version, donc le comportement métier n'a pas changé.
- **Seuil** : le gros atelier de la mesure compte environ 37 000 commandes payées, au-dessus de la limite de 32 767. Un atelier réel n'en est pas proche, mais la panne était brutale, sans signe avant-coureur, et touchait la page d'accueil.

### 2.2 Quatre allers-retours d'authentification par requête (réduit à 2 ou 3)

Chaque requête d'un PDG enchaînait quatre lectures avant la requête métier : compte (version de session), atelier (suspendu ?), atelier **encore** (échéance d'essai), abonnements.

- **Correction** (`middlewares/auth.middleware.js`) : l'échéance d'essai est lue avec l'état de suspension (une seule lecture de la ligne Atelier), et les abonnements ne sont lus que si l'essai est terminé.
- **Effet** : de 4 à 2 requêtes pendant l'essai (et pour les ateliers anciens sans échéance), de 4 à 3 après. Mesuré : -2 requêtes SQL sur chaque route (ex. `GET /api/commandes/:id` : 9 → 7, `GET /api/depenses` : 6 → 4).
- **Comportement inchangé** : suspension immédiate, blocage 402 à la fin de l'essai sans abonnement actif, contournement en impersonation. Couvert par les tests d'intégration existants (`trial-abonnement`, `role-boundaries`, `tenant-isolation`), tous verts.
- **Gain réel non mesuré** : en local, une requête SQL coûte moins d'1 ms, donc le gain en millisecondes est invisible ici. Sur Neon, chaque aller-retour réseau coûte davantage ; le gain est proportionnel au nombre d'allers-retours supprimés, mais je n'ai **pas** mesuré sur Neon (aucun accès pendant ce travail). À mesurer au premier déploiement (voir §5).

### 2.3 Premier chargement : un seul paquet JavaScript de 715 ko (corrigé)

Toutes les pages (atelier, cliente finale, plateforme) étaient dans un seul fichier.

- **Correction** (`frontend/src/App.jsx`) : chaque page est chargée à la demande (`React.lazy` + `Suspense`). L'écran de connexion reste dans le paquet initial.
- **Mesure** (`vite build`) :

| | Avant | Après |
|---|---|---|
| Paquet principal | 715 ko (177 ko gzip) | 294 ko (89 ko gzip) |
| Chargé au premier affichage (principal + `i18n` + `errorMessage`) | 715 ko (177 ko gzip) | 420 ko (130 ko gzip) |
| Pages | dans le paquet | 48 fragments de 0,7 à 28 ko |

  Soit environ **-41 % en volume brut et -26 % en gzip** au premier affichage. L'application est une PWA : tous les fragments sont aussi pré-chargés par le service worker, donc l'usage hors ligne et les visites suivantes ne changent pas.
- **Non mesuré** : le temps de chargement réel sur réseau mobile. Les 130 ko restants sont surtout React, le routeur, TanStack Query et les traductions.
- **Vérifié** : tests frontend (62) et 27 parcours E2E dans un vrai navigateur, tous verts.

## 3. Résultats par route (gros atelier, base locale)

Médianes en ms. « Avant » : une exécution sur le code d'origine ; « Après » : médiane de 5 exécutions. À l'échelle de la milliseconde, ces durées varient d'une exécution à l'autre : **le nombre de requêtes SQL est la mesure fiable**, les millisecondes sont indicatives.

| Route | Avant (HTTP / ms / SQL) | Après (HTTP / ms / SQL) |
|---|---|---|
| Tableau de bord — synthèse | **500** / 126 / 13 | 200 / 50 / 11 |
| Tableau de bord — récents | 200 / 86 / 11 | 200 / 76 / 9 |
| Commandes — liste (page 1) | 200 / 54 / 9 | 200 / 39 / 7 |
| Commandes — page 500 | 200 / 46 / 9 | 200 / 42 / 7 |
| Commandes — recherche texte | 200 / 90 / 9 | 200 / 77 / 7 |
| Commandes — export CSV (20 000 lignes, 2 Mo) | 200 / 578 / 7 | 200 / 518 / 5 |
| Commande — détail | 200 / 9 / 9 | 200 / 9 / 7 |
| Clientes — liste | 200 / 30 / 7 | 200 / 25 / 5 |
| Paiements — liste globale | 200 / 29 / 6 | 200 / 29 / 6 |
| Rapports — finances | 200 / 49 / 7 | 200 / 42 / 5 |
| Rapports — à livrer | 200 / 26 / 7 | 200 / 7 / 5 |
| Notifications — compteur (sondé toutes les 60 s) | **500** / 110 / 8 | 200 / 93 / 9 |
| Notifications — liste | **500** / 110 / 8 | 200 / 90 / 12 |

Toutes les autres routes mesurées (dépenses, stock, rapports, totaux d'une cliente) sont sous 50 ms. Total : 204 requêtes SQL avant, 165 après sur les 25 routes (les routes en 500 « avant » s'arrêtaient plus tôt, ce qui minore l'avant).

Aucune requête ne dépasse 70 ms, y compris sur 48 000 commandes et 83 000 paiements. Pas de N+1 constaté : le nombre de requêtes reste de 3 à 12 que la route renvoie 20 lignes ou 20 000 (export CSV : 5 requêtes pour 20 000 commandes).

## 4. Essayé et écarté (chiffres à l'appui)

| Idée | Résultat | Décision |
|---|---|---|
| Index `Paiement(createdAt DESC, id DESC)` pour « activité récente » | Gros atelier : 70 → 31 ms. **Petit atelier : 1,1 → 10 ms** (le planificateur remonte l'index au lieu de partir des commandes de l'atelier) | Écarté : dégrade le cas courant |
| Index sur `Commande.atelierId` plus sélectif | Déjà présent. Pour le gros atelier (83 % des lignes) PostgreSQL choisit un parcours complet, à raison : un index n'y gagnerait rien | Rien à faire |
| Recherche texte (`ILIKE '%…%'`) | 23 ms de parcours complet sur 48 000 commandes. Un index trigramme demanderait une extension et une migration | Écarté : 23 ms ne justifient pas une migration en production |
| Réécrire la réconciliation des notifications en SQL ensembliste | 93 ms sur le gros atelier, une fois par minute et par onglet ouvert | Écarté : refonte importante pour un gain non justifié par ce volume |
| Export CSV : 518 ms pour 20 000 lignes | Borné par `LIMITE_EXPORT` (20 000), mémoire maîtrisée | Conservé tel quel |

## 5. Limites de cette mesure

- **Base locale** (Postgres 17 en Docker), pas Neon : pas de latence réseau, pas de démarrage à froid de la base ni des fonctions Vercel. Les temps absolus en production seront plus élevés ; les comptes de requêtes et les plans restent valables.
- **Un seul utilisateur à la fois** : pas de test de charge concurrente (les tests de concurrence d'intégration couvrent la justesse, pas le débit).
- **Données synthétiques**, générées de façon déterministe : la répartition réelle des statuts et des dates sera différente.
- **À faire au premier déploiement** : relever sur Vercel + Neon le temps de `GET /api/commandes` et le nombre de requêtes par appel (journal d'accès, champ `dureeMs`, voir `docs/JOURNALISATION.md`), puis comparer à ce tableau.

## 6. Phase 7 — vitrine publique, lookbook, demandes en ligne (7.8)

Même méthode que ci-dessus (§1), avec en plus sur le gros atelier : **3 000 modèles dont 2 000 publiés, 4 000 photos (200 images de 2 Ko), 2 000 demandes en ligne** (`scripts/perf/mesure.mjs`, créés en SQL sur la base jetable ; relancer `seed-volume.sql` avant chaque mesure, sinon les identifiants fixes entrent en conflit). Médiane de 3 appels, base locale.

| Route | ms | Requêtes SQL |
|---|---|---|
| Vitrine publique — page 1 | 22 | 5 |
| Vitrine publique — page 80 | 15 | 5 |
| Vitrine publique — recherche texte | 10 | 5 |
| Vitrine publique — filtre par tag | 8 | 5 |
| Vitrine publique — image | 4 | 3 |
| Lookbook — liste des modèles (atelier) | 7 | 4 |
| Demandes en ligne — liste (atelier) | 7 | 7 |

**Constat : rien à corriger.** Aucune requête ne dépasse 3 ms, pas de N+1 (5 requêtes que la page renvoie 1 ou 20 modèles). Les 5 requêtes d'une page publique : **1 écriture** (le limiteur de débit persistant, une par consultation non servie par un cache), l'atelier, le comptage, les modèles, les photos. Aucun index ajouté : à ce volume le plan existant suffit, et l'expérience de la phase 4 (§4) montre qu'un index mal choisi peut dégrader le cas courant.

**Cache HTTP des routes publiques** (vérifié, test `cache-public.test.js`) : la page de vitrine est servie avec `Cache-Control: public, max-age=60, stale-while-revalidate=300` et un `ETag` ; une requête conditionnelle reçoit **304 sans corps** tant que le contenu n'a pas changé, et un contenu modifié change l'`ETag`. Les images sont en `public, max-age=300` avec `ETag`. Toutes les routes privées restent en `no-store`/`private` (testé sur 5 routes) ; une vitrine désactivée répond 404 non cachable.

**Limites**
- **Mesure locale** (pas de latence Neon, pas de démarrage à froid) : les comptes de requêtes sont fiables, les millisecondes absolues ne le sont pas. À relever au premier déploiement.
- **Recherche texte de la vitrine** (`ILIKE '%…%'`) : parcours de l'atelier, 10 ms pour 2 000 modèles publiés. Au-delà de quelques dizaines de milliers de modèles par atelier (irréaliste pour un atelier de couture), il faudrait un index trigramme (extension + migration).
- **Images en base** (octets dans PostgreSQL) : seul l'adaptateur « base » existe. 4 000 photos de 2 Ko ne sont pas représentatives de vraies photos (200 Ko à 2 Mo) : avec des photos réelles, la taille de la base et des sauvegardes croîtra vite. Le **stockage objet reste à brancher** (voir BILAN-PHASE7.md §4).
- **Une écriture par page publique non cachée** : sous forte affluence, le limiteur persistant ajoute une écriture par consultation. Le cache de 60 s côté navigateur et réseau de diffusion absorbe l'essentiel ; non mesuré sous charge concurrente.
