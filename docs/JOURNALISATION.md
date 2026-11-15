# Journalisation technique

Toutes les lignes sont du **JSON, une par événement**, sur la sortie standard (Vercel → Logs).
Champs communs : `niveau` (`debug|info|warn|error`), `type`, `date` (ISO). Module : `backend/src/lib/logger.js`.

## Types d'événements

| `type` | Émis par | Niveau | Contenu |
|---|---|---|---|
| `requete` | journal d'accès (`requestLog.middleware.js`) | `info` ; `warn` si 5xx, lente ou interrompue | `requestId`, `methode`, `chemin`, `route`, `status`, `dureeMs`, `userId`, `atelierId`, `role` ; `lent:true`, `interrompue:true` |
| `erreur` | middleware d'erreur, tâches de fond, e-mails, cron, webhooks | `error` (5xx) / `warn` (4xx) | `requestId`, `categorie`, `status`, `code`, `message` (≤ 300 car.), `pile` (5xx seulement) |
| `securite` | `journaliserSecurite` | `warn` | `evenement`, `userId`, `atelierId`, `ip`, `details` (liste blanche) — copie aussi en base (`JournalSecurite`) |
| `sante` | sonde `/api/health/ready` en échec | `warn` | `requestId`, `db` |

## Diagnostiquer un incident

1. L'utilisateur communique la **référence** affichée avec l'erreur 5xx (`requestId`, aussi dans l'en-tête `X-Request-Id`).
2. Rechercher ce `requestId` dans les logs Vercel : on obtient la ligne `requete` (route, statut, durée, qui) et la
   ligne `erreur` (catégorie, message, pile).
3. Lenteurs : filtrer `"lent":true` ; regrouper par `route` (la route Express, sans identifiants) pour voir quelles
   routes dépassent le seuil.

## Réglages (variables d'environnement)

| Variable | Défaut | Effet |
|---|---|---|
| `LOG_LEVEL` | `info` | niveau minimal émis ; une valeur invalide revient à `info` |
| `LOG_REQUETES` | actif (inactif en test) | `0` coupe le journal d'accès ; `1` le force (même en test) |
| `LOG_SEUIL_LENT_MS` | `1000` | durée à partir de laquelle une requête est marquée lente |

## Ce qui n'est jamais journalisé

Query-string, corps de requête, en-têtes, cookies, jetons, mots de passe, **adresses e-mail et téléphones**.
Seuls des identifiants techniques (`userId`, `atelierId`, `clienteId`, `requestId`) figurent dans les lignes.
Avant cette sous-phase, trois messages d'échec d'envoi d'e-mail contenaient l'adresse du destinataire : corrigé.

## Limites

- Les sondes `/api/health*` réussies ne sont pas journalisées (bruit) ; en échec, elles le sont.
- Pas de requête SQL lente dans les logs : la mesure côté base relève du point « Performances » (4.5).
- Aucun envoi vers un outil externe (agrégateur, alertes) : les logs restent consultables dans Vercel, avec la
  rétention de votre offre.
