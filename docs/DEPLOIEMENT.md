# Déploiement et retour arrière (Vercel)

## Ce qui se passe à chaque build

`vercel.json` → `node scripts/vercel-build.mjs` :

| Environnement Vercel | `prisma generate` | Migrations | Build frontend |
|---|---|---|---|
| `production` | oui | **`migrate status` puis `migrate deploy`** | oui |
| `preview` (branches, PR) | oui | **jamais** | oui |
| `development` / local | oui | jamais | oui |

Règle : **seul un build de production touche au schéma de la base.** Avant, toute prévisualisation
migrait la base à laquelle elle était connectée (la même que la production tant qu'il n'existe qu'une
base Neon). Un échec de migration fait échouer le build : Vercel garde alors **le déploiement précédent
en ligne**. `DIRECT_URL` absente en production fait échouer le build (pas de repli sur la connexion poolée).
La règle est testée : `scripts/__tests__/deployPolicy.test.mjs` (exécutée par `npm test` et la CI).

**Prévisualisations sans `DIRECT_URL`** : la configuration Prisma exige que `DIRECT_URL` soit définie, même pour `prisma generate` (qui n'ouvre aucune connexion). Elle n'existe que pour Production sur Vercel : avant correction, tout build de prévisualisation s'arrêtait donc à la génération (« Cannot resolve environment variable: DIRECT_URL »). Le script fournit maintenant une valeur factice pour la seule génération, uniquement quand aucune migration ne sera appliquée ; un build de production sans `DIRECT_URL` échoue toujours explicitement. Cela ne donne pas de base à la prévisualisation : pour qu'elle serve des pages qui lisent des données, `DATABASE_URL` doit être définie pour Preview (idéalement une branche Neon distincte).

Interrupteur de secours : variable `SKIP_MIGRATIONS=1` → le build ne migre pas, même en production.

## Avant de fusionner dans `main` (= déploiement de production)

1. La CI est verte : contrôle `ci-ok` (lint, build, tests unitaires backend, frontend et scripts, cohérence schéma/migrations, tests d'intégration). Les tests E2E et l'audit des dépendances sont visibles mais non bloquants.
2. Si la fusion contient une migration : relire le SQL, lancer `scripts/preflight-contraintes.sql` si elle
   ajoute des contraintes, et **créer un point de restauration Neon** (branche ou instantané) ou lancer
   `scripts/backup-db.sh`.
3. Les migrations restent **additives** (étendre puis contracter) : le code précédent doit fonctionner avec
   le nouveau schéma, ce qui rend le retour arrière du code sans risque.

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
| Migration qui échoue | Rien à faire : le build échoue, l'ancien déploiement reste actif. Corriger, puis refusionner | aucun changement appliqué (migration transactionnelle) |
| Redéployer sans migrer | Définir `SKIP_MIGRATIONS=1`, redéployer, retirer la variable ensuite | aucun |
| Données ou schéma corrompus | Restauration Neon à un instant précis (PITR) ou depuis la sauvegarde ; `scripts/verify-restore.sh` pour vérifier | oui — décision manuelle |
| Commit à annuler dans Git | `git revert <merge>` sur `main` (jamais de réécriture d'historique) | une migration déjà appliquée n'est **pas** annulée : écrire une migration corrective |

## Réglages à faire dans les tableaux de bord (non vérifiables depuis le dépôt)

- GitHub → Branch protection sur `main` : voir « Porte de déploiement » ci-dessous.
- Vercel → variables : `DIRECT_URL` pour l'environnement Production uniquement ; pour Preview, utiliser
  idéalement une **branche Neon distincte** (`DATABASE_URL` Preview) plutôt que la base de production.
- Vercel → `CRON_SECRET`, `JWT_SECRET`, `DATABASE_URL`, `RESEND_*` définis en Production.

## Limites

Le comportement sur Vercel lui-même (variable `VERCEL_ENV`, promotion, rollback) n'a pas été exécuté ici :
seule la logique du script a été testée, en local, avec `VERCEL_ENV` simulée, contre un Postgres jetable.
