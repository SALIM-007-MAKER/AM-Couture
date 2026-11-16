# Sécurité — protections, sauvegarde et journalisation

## Sauvegarde (Neon)
1. **Niveau 1 — Neon Point-in-Time Restore** : activer/vérifier la fenêtre de rétention du projet Neon (console Neon > Settings > Storage). Permet de revenir à un instant précis en créant une *branche* de restauration. Rétention à adapter au plan.
2. **Niveau 2 — dump logique hors Neon** : `scripts/backup-db.sh` (pg_dump format custom + SHA-256). Fréquence recommandée : quotidienne, rétention 30 jours, stockage **chiffré** hors dépôt et hors Vercel (ex. bucket privé). Un dump hors fournisseur protège d'une erreur de compte/projet.
3. **Niveau 3 — test de restauration** : `scripts/verify-restore.sh dump cible_scratch [source]`, sur une base/branche Neon JETABLE, au moins une fois par mois et après chaque changement de schéma majeur. Une sauvegarde jamais restaurée n'est pas une sauvegarde.

Critères : RPO ≤ 24 h, RTO ≤ 2 h (à confirmer par un exercice réel).

## Journalisation de sécurité
Chaque événement est écrit (1) en JSON dans les logs Vercel (`"type":"securite"`) et (2) en base, table `JournalSecurite` (migration `20261114120000_journal_securite`).
- Événements : LOGIN_OK/ECHEC, MOT_DE_PASSE_CHANGE/REINITIALISE(_PAR_SUPERADMIN), IMPERSONATION_DEBUT/FIN, ATELIER_SUSPENDU/REACTIVE, RATE_LIMIT.
- Colonnes : evenement, userId, atelierId, ip, details (JSON), createdAt. Aucun mot de passe, jeton, cookie, identifiant saisi ni corps de requête ; `details` est filtré par liste blanche de clés (compteId, prefixe), valeurs tronquées à 100 caractères.
- Pas de clé étrangère : le journal survit à la suppression d'un compte ou d'un atelier.
- Index : createdAt, (evenement, createdAt), (atelierId, createdAt), (userId, createdAt).
- Conservation : 365 jours (variable `RETENTION_JOURNAL_SECURITE_JOURS`), purge quotidienne par le cron. L'IP est une donnée personnelle : ne pas allonger sans base légale.
- Consultation : `GET /api/plateforme/journal-securite` (SUPERADMIN uniquement), filtres evenement/atelierId/userId, pagination.

## Variables d'environnement
`.env*` est ignoré par Git et n'a jamais été commité (vérifié sur tout l'historique). Secrets uniquement dans Vercel. `JWT_SECRET` ≥ 32 caractères obligatoire en production (l'API refuse de démarrer sinon). `ALLOWED_ORIGINS` (optionnel) : hôtes supplémentaires autorisés pour les requêtes d'écriture.

## Emails (Resend)
- Production : définir `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (domaine vérifié sur Resend) et `PUBLIC_APP_URL`. Le domaine de test `onboarding@resend.dev` n'envoie qu'à l'adresse du propriétaire du compte Resend : inutilisable pour de vrais ateliers.
- Tous les textes interpolés dans les gabarits sont échappés (`esc()`), les liens utilisent `PUBLIC_APP_URL` quand elle est définie.
- Tests : `integration-tests/emails.test.js` simule Resend (aucun envoi réel).

## Cron
`GET /api/cron/rappels-quotidiens` (Vercel Cron, 07:00) : 503 si `CRON_SECRET` absent, 401 si mauvais secret ; envoie les rappels et purge le journal de sécurité (> `RETENTION_JOURNAL_SECURITE_JOURS`). Tests : `integration-tests/cron-purge.test.js`.

## Dépendances
`npm audit --omit=dev` : 0. Alertes restantes (développement uniquement) : chaîne `vite-plugin-pwa` → `workbox-build` (deepmerge, glob, minimatch), absente du bundle livré, sans correctif amont (workbox-build 7.4.1 est la dernière version). À surveiller, pas d'action.
