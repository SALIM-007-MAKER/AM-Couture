# Gestion des erreurs et résilience

Sous-phase 3.2. Décrit ce que voit un client quand quelque chose échoue, ce qui est journalisé, et
comment l'API se comporte quand la base de données ou un service externe est indisponible.

## 1. Format des réponses d'erreur

```json
{ "error": "Message sûr en français", "details": { "champ": ["…"] }, "requestId": "uuid" }
```

- `details` : uniquement pour les erreurs métier et de validation.
- `requestId` : présent sur toute réponse **5xx**, identique à l'en-tête `X-Request-Id` (présent sur
  **toutes** les réponses). À demander à l'utilisateur qui signale un problème : il retrouve la ligne
  de journal exacte.
- Le message n'est **jamais** le texte brut d'une bibliothèque (SQL, nom de contrainte, extrait du JSON
  reçu). Seuls les messages choisis dans `lib/classifierErreur.js` ou levés par `HttpError` sortent.

## 2. Classement central (`lib/classifierErreur.js`)

| Cause | Statut | Notes |
|---|---|---|
| `HttpError` (erreurs métier) | celui de l'erreur | message et détails inchangés |
| JSON invalide | 400 | « Corps de requête invalide : JSON attendu. » |
| Corps trop volumineux (> 5 Mo) | 413 | « Requête trop volumineuse. » |
| Violation d'unicité (`P2002`) | 409 | « Un enregistrement identique existe déjà. » |
| Clé étrangère (`P2003`) | 409 | |
| Enregistrement absent (`P2025`) | 404 | |
| Conflit d'accès (`P2034`, deadlock `40P01`, `40001`) | 409 | « Conflit d'accès simultané : réessayez. » |
| Base indisponible : injoignable, refus, trop de connexions (`53300`), transaction expirée (`P2028`), délai de connexion ou de requête | **503** + `Retry-After: 5` | « Service temporairement indisponible. Réessayez dans un instant. » |
| Toute autre erreur | 500 | « Une erreur est survenue. » |

Les formes d'erreur ont été **observées** sur Prisma 7 + `@prisma/adapter-pg` (la classe réelle est
dans `meta.driverAdapterError.cause.kind` et `originalCode`), puis vérifiées contre de vraies erreurs
dans `integration-tests/erreurs-reelles.test.js`.

## 3. Journal des erreurs

Une ligne JSON par erreur : `type`, `date`, `requestId`, `methode`, `chemin`, `status`, `categorie`,
`code`, `message` (tronqué), et `userId` / `atelierId` / `role` si la requête est authentifiée.

- **Chemin sans query-string** : un jeton passé en paramètre (`?token=…`) n'atteint jamais le journal.
  Avant la 3.2, l'URL complète était journalisée.
- **Corps de requête jamais journalisé.**
- Pile conservée uniquement pour les 5xx (8 lignes). Niveau `warn` pour les 4xx, `error` pour les 5xx.
- Rejets de promesse non gérés et exceptions non interceptées (`lib/processHandlers.js`) : même format,
  `categorie` = `rejet_non_gere` / `exception_non_geree`. Un rejet est journalisé sans arrêter
  l'instance ; une exception non interceptée arrête le processus (état indéterminé).

## 4. Délais et disponibilité

| Réglage | Défaut | Variable |
|---|---|---|
| Attente de connexion à la base | 4000 ms | `DB_CONNECT_TIMEOUT_MS` |
| Durée maximale d'une requête | 25000 ms | `DB_QUERY_TIMEOUT_MS` |
| Inactivité d'une connexion du pool | 10000 ms | `DB_IDLE_TIMEOUT_MS` |
| Appel à Resend | 8000 ms | `RESEND_TIMEOUT_MS` |

Ce sont des délais **côté client** : aucun paramètre de session n'est envoyé au serveur, ce qui reste
compatible avec le pooler Neon (pgbouncer).

> Une route qui fait deux accès successifs à la base (limiteur de débit, puis requête métier) peut
> attendre jusqu'à **2 × `DB_CONNECT_TIMEOUT_MS`** quand la base ne répond pas. Avec 4 s le pire cas
> reste sous ~8 s ; à adapter à la durée maximale des fonctions de votre plan.

**Mesure** (base injoignable, route de connexion) : avant, requête suspendue sans fin (plus de 8 s sans
réponse) ; après, 503 en ~2 s avec un délai de connexion de 1 s, et en ~16 s avec l'ancienne valeur de
8 s — d'où le défaut de 4 s.

### Santé

- `GET /api/health` — **liveness** : le processus répond. Indépendante de la base. Réponse inchangée.
- `GET /api/health/ready` — **readiness** : `SELECT 1` borné à 2,5 s. `200 {status:"ok", db:"ok",
  latenceMs}` ou `503 {status:"degraded", db:"indisponible"}`. Aucun détail technique (ni adresse, ni
  message) dans la réponse. À utiliser pour la supervision externe.

## 5. Ce qui n'est PAS couvert (sous-phases suivantes ou décisions)

- **Suivi d'erreurs centralisé** (Sentry ou équivalent) : le journal structuré est prêt à être branché,
  mais aucun service n'est choisi ni intégré — décision à prendre.
- **Disjoncteur** : après un échec de connexion, chaque requête suivante attend à nouveau le délai.
  Un état « base indisponible » mémorisé quelques secondes permettrait de répondre 503 immédiatement.
- **Reprise des emails échoués** et envois du cron en parallèle borné (analyse 9.4).
- **Limiteur de débit** : échoue toujours « ouvert » quand la base est indisponible (choix conservé).
- **Interface** : les écrans n'affichent pas encore `requestId` ni de message dédié « hors ligne »
  (sous-phase 3.6).
- **Pool de connexions** (`max: 20` par instance) : inchangé ; réglage à mesurer en 3.5.

## 5. Affichage dans l'interface (sous-phase 4.3)

`frontend/src/lib/apiError.js` classe chaque échec (`ApiError.kind`) et `lib/errorMessage.js`
(`messageUtilisateur`) choisit le texte affiché :

| Cas | `kind` | Texte affiché | Référence |
|---|---|---|---|
| Erreur métier ou de validation (4xx, dont 409 et 429) | `client` | message du serveur, tel quel | non |
| Aucune réponse (coupure, hors ligne) | `network` | « Vérifiez votre connexion… » | non |
| Aucune réponse en 40 s | `timeout` | « Le serveur met trop de temps… » | non |
| 503 | `unavailable` | « Service momentanément indisponible… » | oui |
| 413 | `tooLarge` | « Données trop volumineuses… » | non |
| Autre 5xx (dont 502/504 de la plateforme, corps non JSON) | `server` | « Une erreur est survenue de notre côté… » | oui |
| Exception non prévue côté interface | — | message générique | non |

- Les messages de panne sont **traduits** (fr/en) côté interface : le serveur n'envoie qu'une phrase française.
- La **référence** (`requestId`, lue dans le corps ou l'en-tête `X-Request-Id`) s'affiche, sélectionnable,
  sous les erreurs serveur ; l'utilisateur la communique et l'on retrouve la requête dans les logs
  (voir `JOURNALISATION.md`).
- Avant : une coupure réseau n'affichait **rien** dans plusieurs boutons (annulation, reçu, renvoi de
  vérification) ; une requête sans réponse laissait l'écran en chargement indéfiniment ; aucune référence
  n'était montrée.
- Une annulation voulue par le code (changement de page) n'est pas traitée comme une panne.
- Limite : le délai de 40 s est un réglage unique (`DELAI_REQUETE_MS`) ; un envoi d'image très lent sur
  une mauvaise connexion pourrait l'atteindre.
