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

Interrupteur de secours : variable `SKIP_MIGRATIONS=1` → le build ne migre pas, même en production.

## Avant de fusionner dans `main` (= déploiement de production)

1. La CI est verte (lint, build, tests unitaires, tests d'intégration).
2. Si la fusion contient une migration : relire le SQL, lancer `scripts/preflight-contraintes.sql` si elle
   ajoute des contraintes, et **créer un point de restauration Neon** (branche ou instantané) ou lancer
   `scripts/backup-db.sh`.
3. Les migrations restent **additives** (étendre puis contracter) : le code précédent doit fonctionner avec
   le nouveau schéma, ce qui rend le retour arrière du code sans risque.

## Retour arrière

| Problème | Action | Effet sur la base |
|---|---|---|
| Code défectueux, schéma compatible | Vercel → Deployments → déploiement précédent → **Promote to Production** (ou `vercel rollback`) | aucun |
| Migration qui échoue | Rien à faire : le build échoue, l'ancien déploiement reste actif. Corriger, puis refusionner | aucun changement appliqué (migration transactionnelle) |
| Redéployer sans migrer | Définir `SKIP_MIGRATIONS=1`, redéployer, retirer la variable ensuite | aucun |
| Données ou schéma corrompus | Restauration Neon à un instant précis (PITR) ou depuis la sauvegarde ; `scripts/verify-restore.sh` pour vérifier | oui — décision manuelle |
| Commit à annuler dans Git | `git revert <merge>` sur `main` (jamais de réécriture d'historique) | une migration déjà appliquée n'est **pas** annulée : écrire une migration corrective |

## Réglages à faire dans les tableaux de bord (non vérifiables depuis le dépôt)

- GitHub → Branch protection sur `main` : exiger les jobs `verifier` et `tests-integration` avant fusion.
  Sans cela, Vercel déploie dès le push, que la CI soit verte ou non.
- Vercel → variables : `DIRECT_URL` pour l'environnement Production uniquement ; pour Preview, utiliser
  idéalement une **branche Neon distincte** (`DATABASE_URL` Preview) plutôt que la base de production.
- Vercel → `CRON_SECRET`, `JWT_SECRET`, `DATABASE_URL`, `RESEND_*` définis en Production.

## Limites

Le comportement sur Vercel lui-même (variable `VERCEL_ENV`, promotion, rollback) n'a pas été exécuté ici :
seule la logique du script a été testée, en local, avec `VERCEL_ENV` simulée, contre un Postgres jetable.
