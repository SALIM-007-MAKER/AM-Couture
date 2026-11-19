# Déploiement et retour arrière (Vercel)

## Ce qui se passe à chaque build

`vercel.json` → `node scripts/vercel-build.mjs` :

| Environnement Vercel | `prisma generate` | Migrations | Build frontend |
|---|---|---|---|
| `production` | oui | **`migrate status` (informatif), `migrate deploy`, puis `migrate status` (vérification finale)** | oui |
| `preview` (branches, PR) | oui | **jamais** | oui |
| `development` / local | oui | jamais | oui |

Règle : **seul un build de production touche au schéma de la base.** Avant, toute prévisualisation
migrait la base à laquelle elle était connectée (la même que la production tant qu'il n'existe qu'une
base Neon). Un échec de migration fait échouer le build : Vercel garde alors **le déploiement précédent
en ligne** (mais la base, elle, peut avoir été modifiée en partie : voir « Une migration n'est pas atomique »).
`DIRECT_URL` absente en production fait échouer le build (pas de repli sur la connexion poolée).
La règle est testée : `scripts/__tests__/deployPolicy.test.mjs` (exécutée par `npm test` et la CI).

### Étapes de migration d'un build de production

Définies par `etapesMigration` (`scripts/lib/deployPolicy.mjs`, testée) et exécutées par `vercel-build.mjs` :

| Étape | Commande | Bloque le build si elle échoue ? |
|---|---|---|
| `etat-avant` | `prisma migrate status` | **Non** (informatif) |
| `application` | `prisma migrate deploy` | **Oui** |
| `verification-finale` | `prisma migrate status` | **Oui** |

- **Pourquoi l'état avant ne bloque pas.** `migrate status` renvoie le code 1 dès qu'il existe des migrations *en attente*, ce qui est le
  cas normal avant `migrate deploy`. Quand cette étape bloquait, le premier build de production qui avait des migrations à appliquer
  s'arrêtait en quelques secondes, avant `migrate deploy` : rien n'était appliqué et la production restait sur l'ancienne version.
- **Pourquoi `migrate deploy` bloque.** Il est le seul à appliquer ; s'il échoue, le déploiement précédent reste en ligne.
- **Pourquoi la vérification finale.** Après un `deploy` réussi, `status` doit répondre « à jour » (code 0). Sinon la base n'est pas dans l'état
  attendu par le code qu'on s'apprête à publier, et le build s'arrête avant la publication.
- Hors production (prévisualisation, local, `SKIP_MIGRATIONS=1`) : aucune de ces étapes n'est exécutée.

### Une migration n'est pas atomique (à connaître avant chaque migration en production)

**Vérifié sur PostgreSQL 17 (`scripts/__tests__/migrations-simulation.test.mjs`) : Prisma n'enveloppe pas une migration dans une transaction.**
Si une instruction échoue, celles qui ont été exécutées avant restent appliquées ; la migration est enregistrée comme échouée et
**tout nouveau `migrate deploy` est refusé** (erreur `P3009`) jusqu'à récupération. L'ancienne affirmation « migration transactionnelle,
aucun changement appliqué » était fausse.

- Le build échoue, donc le déploiement précédent reste en ligne, **mais la base peut être dans un état intermédiaire**.
- Dans un lot de plusieurs migrations, celles qui précèdent l'échec restent appliquées ; celles qui suivent ne sont pas tentées.
- **Pour les nouvelles migrations : les envelopper dans `BEGIN; … COMMIT;`** — testé, un échec n'en laisse alors rien. (Ne jamais modifier une
  migration déjà appliquée : sa somme de contrôle est enregistrée dans la base.)
- **Récupération** après un échec : (1) lire `_prisma_migrations.logs` ; (2) **défaire à la main** tout ce que la migration avait déjà appliqué ;
  (3) `prisma migrate resolve --rolled-back <nom>` ; (4) corriger le SQL ; (5) redéployer. Sans l'étape 2, le rejeu échoue (« already exists »).

**Prévisualisations sans `DIRECT_URL`** : la configuration Prisma exige que `DIRECT_URL` soit définie, même pour `prisma generate` (qui n'ouvre aucune connexion). Elle n'existe que pour Production sur Vercel : avant correction, tout build de prévisualisation s'arrêtait donc à la génération (« Cannot resolve environment variable: DIRECT_URL »). Le script fournit maintenant une valeur factice pour la seule génération, uniquement quand aucune migration ne sera appliquée ; un build de production sans `DIRECT_URL` échoue toujours explicitement. Cela ne donne pas de base à la prévisualisation : pour qu'elle serve des pages qui lisent des données, `DATABASE_URL` doit être définie pour Preview (idéalement une branche Neon distincte).

Interrupteur de secours : variable `SKIP_MIGRATIONS=1` → le build ne migre pas, même en production.

## Avant de fusionner dans `main` (= déploiement de production)

1. La CI est verte : contrôle `ci-ok` (lint, build, tests unitaires backend, frontend et scripts, cohérence schéma/migrations, tests d'intégration). Les tests E2E et l'audit des dépendances sont visibles mais non bloquants.
2. Si la fusion contient une migration : relire le SQL, lancer `scripts/preflight-contraintes.sql` si elle
   ajoute des contraintes, et **créer un point de restauration Neon** (branche ou instantané) ou lancer
   `scripts/backup-db.sh`.
3. Les migrations restent **additives** (étendre puis contracter) : le code précédent doit fonctionner avec
   le nouveau schéma, ce qui rend le retour arrière du code sans risque. Une contrainte `CHECK` ajoutée n'est pas additive : elle
   s'applique aussi aux écritures de l'ancien code. Exception connue : `20261202090000_tracabilite_mouvements_stock` (une sortie de stock sans
   motif, et une réception d'achat qui n'écrit pas `source`, sont refusées). Voir la procédure ci-dessous.

## Porte de déploiement : ce que la CI garantit, et ce qu'elle ne garantit pas

Vercel déploie dès qu'un commit arrive sur `main`, **sans attendre GitHub Actions** : le fichier de workflow ne peut donc pas, seul, bloquer un déploiement. La porte se situe avant `main` :

1. Le job `ci-ok` agrège les contrôles obligatoires (`verifier` et `tests-integration`). Il échoue si l'un d'eux échoue, **et** s'il est sauté (GitHub traite un contrôle sauté comme réussi, d'où `if: always()`).
2. Dans GitHub → Settings → Branches → règle sur `main` : cocher « Require a pull request before merging », « Require status checks to pass before merging » et ajouter **`ci-ok`** ; cocher aussi « Do not allow bypassing the above settings » pour que l'administrateur y soit soumis.
3. Avec cette règle, rien n'atteint `main` (donc Vercel) sans CI verte. Sans cette règle, un `git push` direct sur `main` déploie en production même si la CI est rouge — **cette règle n'est pas active tant que quelqu'un ne l'a pas réglée dans GitHub** (non faisable ni vérifiable depuis le dépôt).

Conséquence sur le flux de travail actuel (fusion locale puis `push`) : il faut passer par une branche et une pull request.

Limite : une CI rouge détectée **après** la fusion (par exemple un job qui ne tourne que sur `main`) n'arrête pas le déploiement déjà parti ; le retour arrière se fait alors comme décrit ci-dessous.

## Retour arrière

| Problème | Action | Effet sur la base |
|---|---|---|
| Code défectueux, schéma compatible | Vercel → Deployments → déploiement précédent → **Promote to Production** (ou `vercel rollback`) | aucun |
| Migration qui échoue | Le build échoue, l'ancien déploiement reste actif. **Vérifier l'état de la base** : une migration n'est pas atomique (voir ci-dessus) ; défaire à la main ce qui a été appliqué, `migrate resolve --rolled-back`, corriger, puis refusionner | **possible changement partiel** ; les déploiements suivants sont refusés tant que la migration échouée n'est pas résolue |
| Redéployer sans migrer | Définir `SKIP_MIGRATIONS=1`, redéployer, retirer la variable ensuite. **Dangereux si le code attend un schéma pas encore migré** : le build réussit et publie du code qui ne correspond pas à la base | aucun |
| Données ou schéma corrompus | Restauration Neon à un instant précis (PITR) ou depuis la sauvegarde ; `scripts/verify-restore.sh` pour vérifier | oui — décision manuelle |
| Commit à annuler dans Git | `git revert <merge>` sur `main` (jamais de réécriture d'historique) | une migration déjà appliquée n'est **pas** annulée : écrire une migration corrective |

## Mettre en production une version qui contient des migrations

À suivre dès que le build de production aura plusieurs migrations en attente (cas typique : la production a pris du retard sur `main`).

1. **Mesurer l'écart.** Comparer les migrations de `main` à celles déjà appliquées en production (`_prisma_migrations`). Relire le SQL des
   migrations en attente et repérer : `UPDATE`/`DELETE`, `SET NOT NULL`, `DROP`, contraintes `CHECK`, changements de type.
2. **Point de restauration Neon** (branche ou instantané) ou `scripts/backup-db.sh`, avant tout.
3. **Répéter sur une copie de la production** : créer une branche Neon à partir de la base de production et y lancer `prisma migrate deploy`
   (avec la `DIRECT_URL` de cette branche, jamais celle de la production). Vérifier les comptes de lignes avant/après et les remplissages.
4. `scripts/preflight-contraintes.sql` sur la base de production si des contraintes sont ajoutées.
5. **Choisir le moment** : les migrations s'appliquent pendant le build, l'ancien code continue de servir jusqu'à la publication. Si une
   contrainte refuse des écritures de l'ancien code (cas de `20261202090000_tracabilite_mouvements_stock` : sortie de stock sans motif), c'est pendant
   cette fenêtre de quelques minutes ; préférer un moment à faible trafic.
6. **Publier toutes les migrations dépendantes ensemble** (une seule version) plutôt qu'en deux fois, quand la première contiendrait du code que la
   seconde rendrait incompatible (le stock après les achats : une réception d'achat serait refusée pendant la fenêtre).
7. Fusionner. Suivre le journal du build : `[build] > npx prisma migrate status` (code 1 normal), `migrate deploy`, puis la vérification finale.
8. Si le build échoue : ne pas relancer à l'aveugle. Lire le journal, vérifier l'état de la base (voir « Une migration n'est pas atomique »).

Répétition réalisée sur base jetable (PostgreSQL 17, données de test dans l'ancien schéma) : passage de l'état de production `a5b961f`
(21 migrations) à 40 migrations, flux de production complet réussi en 24 s ; aucune ligne perdue ; remplissages corrects (`Notification.atelierId`
puis `NOT NULL`, `Transaction.atelierId`, langue `ha` vers `fr`, origine des mouvements de stock) ; lignes anciennes de stock conservées même si
la nouvelle règle les refuserait (contraintes `NOT VALID`). Cela ne remplace pas l'étape 3 : les données réelles de production n'ont pas été vues.

## Tests des migrations

- `scripts/__tests__/etapesMigration.test.mjs` : ordre et caractère bloquant des étapes, aucune migration en prévisualisation, en local ou avec
  `SKIP_MIGRATIONS=1` (sans base ; exécuté par `npm test` et la CI).
- `scripts/__tests__/migrations-simulation.test.mjs` : 13 scénarios sur une **vraie base Postgres jetable** (migrations en attente, réussie,
  échouée, partiellement exécutée, lot partiel, récupération, base inaccessible, vérification finale). Ignoré sans `SIM_DATABASE_URL`.
  ```
  docker run -d --name sim-pg -e POSTGRES_USER=sim -e POSTGRES_PASSWORD=sim -e POSTGRES_DB=gestion_atelier_sim_migrations -p 127.0.0.1:55433:5432 postgres:17
  SIM_DATABASE_URL=postgresql://sim:sim@localhost:55433/gestion_atelier_sim_migrations node --test scripts/__tests__/migrations-simulation.test.mjs
  ```
  Garde-fous : la base doit être locale et son nom doit contenir « sim » ; son schéma `public` est réinitialisé avant chaque scénario.

## Réglages à faire dans les tableaux de bord (non vérifiables depuis le dépôt)

- GitHub → Branch protection sur `main` : voir « Porte de déploiement » ci-dessous.
- Vercel → variables : `DIRECT_URL` pour l'environnement Production uniquement ; pour Preview, utiliser
  idéalement une **branche Neon distincte** (`DATABASE_URL` Preview) plutôt que la base de production.
- Vercel → `CRON_SECRET`, `JWT_SECRET`, `DATABASE_URL`, `RESEND_*` définis en Production.

## Limites

Le comportement sur Vercel lui-même (variable `VERCEL_ENV`, promotion, rollback) n'a pas été exécuté ici :
seule la logique du script a été testée, en local, avec `VERCEL_ENV` simulée, contre un Postgres jetable.

Autres limites : l'état réel de la base Neon de production n'a pas été lu ; les scénarios simulés utilisent la CLI Prisma 7 sur PostgreSQL 17
(la version de Neon peut différer) ; le verrouillage contre deux `migrate deploy` simultanés n'est pas documenté par Prisma et n'a pas été testé ;
le code 1 de `migrate status` en état « migration échouée » est observé sur la base jetable, pas sur Neon.
