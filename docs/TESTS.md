# Tests : inventaire et exécution

| Niveau | Où | Outil | Commande | Effectif (15/11/2026) | Dans la CI |
|---|---|---|---|---|---|
| Unitaires backend | `backend/src/**/__tests__` | `node --test` | `npm test` | 344 (dont 4 de cohérence de `docs/API.md`) | oui (`verifier`) |
| Unitaires frontend | `frontend/src/**/__tests__` | `node --test` | `npm test` | 124 | oui (`verifier`) |
| Déploiement | `scripts/__tests__` | `node --test` | `npm test` | 7 | oui (`verifier`) |
| Intégration (API + Prisma + Postgres) | `backend/src/integration-tests` | `node --test` | `npm run test:integration` | 461 (460 + 1 `TODO` volontaire) | oui (`tests-integration`) |
| End-to-end (navigateur réel → frontend → API → Postgres) | `e2e/specs` | Playwright | `npm run test:e2e` | 133 | job `tests-e2e`, **non bloquant** (jamais exécuté sur GitHub) |
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

### Fichiers en parallèle sur une base partagée : le verrou de la tâche quotidienne

`npm run test:integration` lance les fichiers de test **en parallèle** (`--test-concurrency=4`, processus distincts) sur **la même base**. Chaque
fichier crée ses propres ateliers et supprime ce qu'il a créé, mais la tâche quotidienne (`GET /api/cron/rappels-quotidiens`) examine **tous**
les ateliers de la base. Si un fichier la lance pendant qu'un autre a créé ses ateliers de rappels, le premier envoie les courriels du second
(par son propre faux Resend) et réserve les rappels : le second ne reçoit plus rien et échoue
(« Rappels d'abonnement… envoie le bon rappel aux bons ateliers »). L'échec était reproduit à chaque fois avec `rappels-abonnement` +
`cron-resilience` en parallèle ; sur d'autres combinaisons, le résultat dépend des horaires de chaque exécution.

Correction (tests seulement, aucun code métier) : `backend/src/integration-tests/verrou-cron.js` fournit un verrou consultatif PostgreSQL
(`pg_advisory_lock`) pris, sur une connexion dédiée, en tête du `before` et libéré à la fin du `after` de chaque fichier qui lance la tâche
(`rappels-abonnement`, `cron-resilience`, `cron-purge`, `wave-abonnement`). Ces fichiers s'exécutent l'un après l'autre, quel que soit le
degré de parallélisme ; les autres restent parallèles. Un processus qui meurt libère son verrou. Test du verrou : `verrou-cron.test.js`.

**Règle pour un nouveau fichier de test** : s'il appelle `/api/cron/rappels-quotidiens`, il doit prendre ce verrou
(`prendreVerrou()` dans un `before` déclaré en premier, libération dans un `after` déclaré après le nettoyage).

## Tests de bout en bout (local)

Prérequis : Chrome installé (Playwright l'utilise, aucun navigateur à télécharger) et une base Postgres **dédiée dont
le nom contient « e2e »** — le seed la **vide** à chaque exécution et refuse toute base non locale ou sans « e2e ».

```
docker exec am-test-pg psql -U test -d postgres -c "CREATE DATABASE gestion_atelier_e2e"
DATABASE_URL=postgresql://test:test@localhost:55432/gestion_atelier_e2e DIRECT_URL=postgresql://test:test@localhost:55432/gestion_atelier_e2e npx prisma migrate deploy
E2E_DATABASE_URL=postgresql://test:test@localhost:55432/gestion_atelier_e2e npm run test:e2e
```

Les ports 4000 (API) et 5173 (Vite) doivent être libres : les serveurs sont lancés et arrêtés par Playwright. Pour lancer les E2E **à côté de
serveurs de développement déjà ouverts**, choisir d'autres ports : `E2E_PORT_API=4391 E2E_PORT_WEB=5391` (voir `e2e/ports.js`, le proxy de
Vite suit via `VITE_API_PORT`). L'API de test écrit sa sortie dans `e2e-journal/api.log` (ignoré par Git) : c'est là que `auth-locale.spec.js`
lit les liens de réinitialisation et de vérification, qui en développement local ne sont jamais renvoyés dans la réponse HTTP.
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
| `receptionniste-tableau-de-bord.spec.js` | tableau de bord complet d'une réceptionniste : compteur « Livraison ≤ 3 j », commandes en retard, livraisons à venir, aucun 403, aucun montant, 403 maintenu sur `/api/rapports/*`, isolation entre ateliers, refus sans `commandes.lire` |
| `tout-voir-tableau-de-bord.spec.js` | liens « Tout voir » du tableau de bord : réceptionniste vers `/commandes` filtré (retard, fenêtre de livraison), jamais vers `/rapports` ; PDG et comptable vers `/rapports` |
| `employes-libelles.spec.js` | page des permissions d'un employé : 28 libellés lisibles en français et en anglais, aucune clé technique `emp.perm.*`, droits par défaut d'un poste inchangés |
| `superadmin-vue-ensemble.spec.js` | vue d'ensemble de la plateforme : état vide des graphiques, devise FCFA, infobulle par mois, six indicateurs (tendances simulées) |
| `quotas.spec.js` | quotas des formules : jauges de la page Abonnement, création jusqu'à la limite puis refus traduit (sans bannière de lecture seule), archivage qui libère, restauration refusée au quota, employés, commandes actives, modèles, atelier sans quota, vues SuperAdmin (formules, utilisation d'un atelier) |
| `espaces-metier.spec.js` | un employé de chaque poste (couturier, réceptionniste, magasinier, comptable, autre) : accueil et sections de son métier, aucune erreur d'API, écrans d'un autre métier fermés |
| `stock-tracabilite.spec.js` | sortie sans motif refusée (formulaire et API), motif/origine/auteur dans l'historique, double envoi sans doublon, stock jamais négatif, entrée |
| `auth-locale.spec.js` | inscription puis lien de vérification (dans le journal, vers l'écran), mot de passe oublié sans fuite ni énumération, nouveau mot de passe, lien à usage unique |
| `interface-marque-menu-langue.spec.js` | logo Tailora sur les écrans d'accès, menu latéral fixe (atelier et SuperAdmin) avec défilement interne, mobile, langue du SuperAdmin |
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

## CSP : le hash du script inline et les fins de ligne (Windows)

La CSP de `vercel.json` autorise le script inline de `frontend/index.html` par son hash SHA-256. Vite recopie ce script **octet pour octet** dans
le build : le hash servi dépend donc des fins de ligne de la source au moment du build. Un CRLF (extraction Git sous Windows avec
`core.autocrlf=true`) donne un autre hash, et le navigateur bloquerait le script (initialisation du thème). Cas concerné : un déploiement lancé
depuis un poste Windows (`vercel deploy`), qui envoie les fichiers tels qu'ils sont sur le disque ; un déploiement par Git (build sous Linux) est en LF.

**Correction.**
- `.gitattributes` : `frontend/index.html text eol=lf` et `vercel.json text eol=lf` — ces deux fichiers sont extraits en LF sur tous les postes,
  quel que soit `core.autocrlf`. La CSP de production n'est pas modifiée.
- Trois tests dans `backend/src/lib/__tests__/security.test.js` : le hash du fichier source figure dans la CSP (test d'origine, inchangé) ;
  `index.html` et `vercel.json` ne contiennent aucun CR (message qui renvoie à `.gitattributes`) ; le script inline du **build réel**
  (`vite build` vers un dossier temporaire) a un hash présent dans la CSP — c'est ce dernier qui garantit que le hash testé est celui du script servi.

**Après un `git pull` qui apporte cette règle**, une copie de travail déjà en CRLF doit être re-extraite : supprimer `frontend/index.html` et
`vercel.json`, puis `git checkout -- frontend/index.html vercel.json` (aucun contenu n'est perdu, le dépôt les stocke en LF).

**Ne pas** « recalculer le hash » dans `vercel.json` depuis un poste Windows en CRLF : on y mettrait le hash de la version CRLF. Si le script inline
change volontairement, recalculer le hash sur la version LF (`git show HEAD:frontend/index.html`).

## Non couvert (à ne pas présumer)

- Rendu des composants React isolés : aucun test unitaire (pas de jsdom). Les parcours E2E ci-dessus les exercent en conditions réelles, sur un périmètre limité.
- Pages longues (`AtelierDetailPage`, `RapportsPage`, `CommandeFormPage`) : logique mêlée au JSX, non testable unitairement sans refonte.
- Compression d'image (`lib/imageFile.js`) : exige un navigateur (canvas).
