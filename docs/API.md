# Documentation de l'API

Référence des 206 routes de l'API REST (`/api/*`). Elle est écrite à la main à partir du code et **vérifiée automatiquement** : le test `backend/src/routes/__tests__/documentationApi.test.js` échoue si une route du code n'est pas listée ici, ou si une route listée n'existe plus. Il ne vérifie pas le contenu des colonnes « Corps / paramètres » : en cas de doute, la source de vérité est le schéma de validation cité (`backend/src/schemas/`).

Documents liés : formats d'erreur → [ERREURS.md](ERREURS.md) · idempotence → [IDEMPOTENCE.md](IDEMPOTENCE.md) · sécurité → [SECURITE.md](SECURITE.md) · journaux → [JOURNALISATION.md](JOURNALISATION.md).

## 1. Conventions

**Format.** JSON en entrée et en sortie (`Content-Type: application/json`), corps limité à 5 Mo (les images sont envoyées en base64 dans le JSON). Les montants et mesures décimales sont renvoyés sous forme de chaînes (`"25000"`). Les dates sont au format ISO 8601.

**Authentification.** Cookie `am_session` (JWT, HttpOnly, `SameSite=Lax`, `Secure` en production), posé par `POST /api/auth/login`. Aucun en-tête `Authorization` n'est utilisé, sauf pour la route cron. À chaque requête, la version de session et l'état de l'atelier sont relus en base : un changement de mot de passe ou une suspension prennent effet immédiatement.

**Protection CSRF.** Toute écriture (`POST`, `PUT`, `PATCH`, `DELETE`) portant un en-tête `Origin` d'un autre site que celui de l'application est refusée (403). Une requête sans `Origin` (curl, serveur à serveur) est acceptée.

**Rôles et niveaux d'accès** (colonne « Accès » ci-dessous) :

| Code | Exigence | Échec |
|---|---|---|
| Public | aucune | — |
| Session | cookie valide, tout rôle | 401 |
| Atelier | compte `ADMIN` (le PDG) rattaché à un atelier actif, **ou compte `EMPLOYE` disposant de la permission correspondante** (voir « Employés et permissions »), **et** essai en cours, abonnement actif ou période de grâce. Une fois la grâce écoulée, l'atelier est en **lecture seule** : `GET` (consultation, exports CSV, PDF) accepté, toute écriture refusée | 401, 403 (rôle ou atelier suspendu), 402 (écriture en lecture seule) |
| Atelier¹ | comme Atelier, **sans** contrôle de l'abonnement | 401, 403 |
| Cliente | compte `USER` (cliente finale) | 401, 403 |
| SuperAdmin | compte `SUPERADMIN` | 401, 403 |
| Cron | `Authorization: Bearer <CRON_SECRET>` | 401, 503 si le secret n'est pas configuré |

Un atelier n'accède jamais aux données d'un autre : une ressource d'un autre atelier répond **404** (pas 403), comme une ressource inexistante. Une session d'impersonation SUPERADMIN agit avec les droits du compte ADMIN visé et n'est jamais bloquée par l'abonnement.

**Erreurs.** `{ "error": "message", "details": {…}, "requestId": "…" }` (`requestId` sur toute 5xx, identique à l'en-tête `X-Request-Id`). `details` des erreurs 400 de validation : `{ "champ": ["message", …] }` ; pour d'autres erreurs (409), sa forme est propre à la route (voir ERREURS.md).

| Statut | Signification |
|---|---|
| 400 | Corps, paramètres ou identifiant invalides |
| 401 | Non connecté, session expirée ou identifiants faux |
| 402 | Écriture refusée : essai ou abonnement terminé au-delà de la période de grâce (lecture seule). `details.lectureSeule` vaut `true` |
| 403 | Rôle insuffisant, atelier suspendu, origine refusée |
| 404 | Ressource inexistante **ou appartenant à un autre atelier** |
| 409 | Conflit métier (doublon, transition interdite, solde dépassé…) |
| 413 | Corps trop volumineux |
| 429 | Trop de tentatives (limiteur de débit) |
| 503 | Base ou service indisponible (réessayer) ; l'en-tête `Retry-After` peut être présent |

**Pagination.** Les listes acceptent `page` (≥ 1, défaut 1) et `pageSize` (1 à 100, défaut 20 ; 50 pour le journal de sécurité) et répondent `{ "data": [...], "meta": { "page", "pageSize", "total", "totalPages" } }`. Les routes `/export` renvoient un CSV (`text/csv`) plafonné à 20 000 lignes, avec les mêmes filtres que la liste.

**Idempotence.** Les 8 créations marquées « idempotente » ci-dessous acceptent l'en-tête optionnel `Idempotency-Key` (8 à 128 caractères parmi lettres, chiffres, `- _ . :`) : rejouer la même requête avec la même clé renvoie la réponse d'origine sans recréer la ressource. Détail : [IDEMPOTENCE.md](IDEMPOTENCE.md).

**Limiteurs de débit** (par IP, persistés en base) : connexion 10 / 15 min · recherche de l'atelier d'un identifiant 30 / 15 min · inscription d'atelier 5 / h · renvoi de l'email de vérification 5 / h · mot de passe oublié 5 / h. Dépassement : 429.

**Identifiants.** Les paramètres `:id`, `:commandeId`, etc. sont validés avant tout accès à la base : un format invalide répond 400.

**Téléphones.** 8 à 15 chiffres. Un numéro de 8 chiffres reçoit l'indicatif du Niger (227) à l'enregistrement.

## 2. Santé et tâches planifiées

| Route | Accès | Description |
|---|---|---|
| `GET /api/health` | Public | Le processus répond : `{ "status": "ok", "service": "gestion-atelier-api" }`. Ne dépend pas de la base. |
| `GET /api/health/ready` | Public | Vérifie la base (`SELECT 1`, 2,5 s maximum) : `200 { "status": "ok", "db": "ok", "latenceMs" }` ou `503 { "status": "degraded", "db": "indisponible" }`. |
| `GET /api/cron/rappels-quotidiens` | Cron | Appelée par Vercel Cron : envoie les rappels de commandes et les rappels d'abonnement (fin d'essai, échéance, une fois par échéance), purge le journal de sécurité (rétention 365 jours) et les clés d'idempotence expirées. |

## 3. Authentification (`/api/auth`)

| Route | Accès | Corps / paramètres → réponse |
|---|---|---|
| `POST /api/auth/login` | Public (limiteur) | `{ identifiant, password }` → `200 { id, identifiant, role, atelierId }` + cookie. 401 au même message que l'identifiant soit inconnu ou le mot de passe faux. |
| `POST /api/auth/logout` | Public | Efface le cookie → `204`. |
| `GET /api/auth/me` | Session | `{ id, identifiant, langue, role, atelierId, createdAt, email, emailVerifieLe, impersonation }` ; `impersonation` vaut `null` hors impersonation, sinon `{ superadminIdentifiant }`. |
| `GET /api/auth/atelier-pour-identifiant` | Public (limiteur) | `?identifiant=` → `{ nom, logoUrl }` de l'atelier du compte (écran de connexion personnalisé), `null` si inconnu. |
| `POST /api/auth/inscription-atelier` | Public (limiteur), refusée si déjà connecté | Crée un atelier et son premier compte ADMIN : `{ prenom, nomProprietaire, email, adminPassword, telephone, nom?, logoUrl?, ville?, pays?, devise?, langue? }` → `201 { id, identifiant, role, atelierId }`. Essai gratuit de 15 jours. |
| `GET /api/auth/verifier-email` | Public | `?token=` → `{ email }` ; valide l'adresse du compte. |
| `POST /api/auth/renvoyer-verification-email` | Session (limiteur) | Renvoie le lien de vérification → `{ message }`. |
| `POST /api/auth/mot-de-passe-oublie` | Public (limiteur) | `{ identifiant }` → `{ message }` identique que le compte existe ou non (pas d'énumération). |
| `POST /api/auth/reinitialiser-mot-de-passe-token` | Public | `{ token, nouveauMotDePasse }` → `204`. Le jeton est à usage unique. |
| `POST /api/auth/activer-compte-client` | Public | Active le compte d'une cliente invitée : `{ token, nouveauMotDePasse }` → `{ id, identifiant, role, atelierId }` + cookie. |
| `POST /api/auth/quitter-impersonation` | Session | Met fin à une impersonation et rétablit la session SUPERADMIN d'origine. |

Politique de mot de passe : voir `backend/src/lib/passwordPolicy.js`.

## 4. Mon compte (`/api/compte`) — Session

| Route | Accès | Corps |
|---|---|---|
| `PATCH /api/compte` | Session | `{ langue: "fr" \| "en" \| "ha" }` |
| `PATCH /api/compte/mot-de-passe` | Session | `{ motDePasseActuel, nouveauMotDePasse }` (différent de l'actuel). Invalide les autres sessions ouvertes. |

## 4 bis. Employés et permissions

Le **PDG** (compte `ADMIN`) a tous les droits sur son atelier. Un **employé** (rôle `EMPLOYE`) n'a que les permissions que le PDG lui accorde ; elles sont relues en base à **chaque requête** (retirer un droit ou désactiver un compte prend effet immédiatement). Sans permission, toute route métier répond **403** sans rien révéler. L'administration de l'atelier (employés, paramètres, abonnement et ses paiements) n'est **jamais délégable** : un employé y reçoit toujours 403, sauf la lecture des paramètres et un état d'accès réduit (`GET /api/abonnements/etat`).

| Permission | Donne accès à |
|---|---|
| `clientes.lire` / `clientes.ecrire` | clientes et mesures |
| `modeles.lire` / `modeles.ecrire` | modèles |
| `commandes.lire` | liste, détail et fiche PDF des commandes |
| `commandes.ecrire` | créer et modifier une commande (un acompte exige aussi `paiements.ecrire`) |
| `commandes.statut` | faire avancer le statut d'une commande, sans pouvoir la créer ni la modifier |
| `livraisons.lire` / `livraisons.ecrire` | livraisons (un paiement final exige aussi `paiements.ecrire`) |
| `demandes.lire` / `demandes.ecrire` | demandes de commande des clientes |
| `stock.lire` / `stock.ecrire` | stock et mouvements |
| `dashboard.lire` / `rapports.lire` | tableau de bord et rapports non financiers |
| `rapports.avances` | rapports avancés (production par employé, retards, achats, dépenses, marges) ; implique `rapports.lire`. Ceux qui portent un montant exigent en plus `finances.voir` |
| `notifications.lire` | lecture des alertes (hors impayés) ; l'état « lu » reste réservé au PDG |
| **`paiements.lire` / `paiements.ecrire`** *(sensible)* | paiements, reçus ; implique `finances.voir` |
| **`depenses.lire` / `depenses.ecrire`** *(sensible)* | dépenses |
| **`finances.voir`** *(sensible)* | montants (prix, payé, solde, prix des modèles et du stock), exports financiers, rapports financiers, totaux d'une cliente, alertes d'impayés |

Une permission d'écriture ajoute la lecture du même module. Sans `finances.voir`, **tous les montants sont retirés des réponses** (commandes, modèles, stock, tableau de bord, livraisons…) et des PDF de fiche de commande. **Postes** (modèles qui pré-remplissent les permissions, ajustables ensuite) : `COUTURIER`, `RECEPTIONNISTE`, `MAGASINIER`, `COMPTABLE`, `AUTRE`.

**Opérations sensibles** : attribuer un droit sensible ou réinitialiser le mot de passe d'un employé exige `confirmationMotDePasse` (le mot de passe du PDG, 10 essais / 15 min ; indisponible pendant une impersonation). Retirer un droit n'exige rien.

| Route | Accès | Corps / paramètres |
|---|---|---|
| `GET /api/employes/catalogue` | PDG | Permissions par module (avec les droits sensibles) et postes avec leurs modèles. |
| `GET /api/employes` | PDG | `?q=`, `actif=true\|false\|all` (défaut `true`), pagination. |
| `GET /api/employes/:id` | PDG | Un employé de l'atelier (404 pour tout autre compte). |
| `POST /api/employes` | PDG, idempotente | `{ identifiant, password, prenom, nom }` + `poste? (défaut AUTRE), permissions? (défaut : celles du poste), email?, telephone?, confirmationMotDePasse?`. 409 si l'identifiant ou l'email est déjà pris ; 400 pour une permission inconnue (nommée). |
| `PATCH /api/employes/:id` | PDG | `prenom?, nom?, poste?, permissions?, email?, telephone?, confirmationMotDePasse?`. Changer de poste **ne modifie pas** les permissions accordées. |
| `POST /api/employes/:id/desactiver` | PDG | `{ motif? }` — le compte ne peut plus se connecter et sa session ouverte est coupée immédiatement ; rien n'est supprimé. Répétable (`dejaTraite`). |
| `POST /api/employes/:id/reactiver` | PDG | Rétablit le compte. Répétable. |
| `POST /api/employes/:id/mot-de-passe` | PDG | `{ nouveauMotDePasse, confirmationMotDePasse }` → `204` ; coupe les sessions de l'employé. |

## 5. Clientes et mesures

Schéma : `cliente.schema.js`, `mesure.schema.js`.

| Route | Accès | Corps / paramètres |
|---|---|---|
| `POST /api/clientes` | Atelier, idempotente | `{ nom, prenom, telephone }` + `telephone2?, email?, adresse?, sexe? ("FEMME" \| "HOMME" \| "AUTRE"), notes?`. 409 si le téléphone existe déjà dans l'atelier (la réponse contient l'identité de la cliente existante dans `details`). |
| `GET /api/clientes` | Atelier | `?q=` (nom, prénom, téléphone), `archived=true\|false\|all` (défaut `false`), `effacement=true` (cliente ayant demandé l'effacement, pas encore anonymisée), `page`, `pageSize`. |
| `GET /api/clientes/export` | Atelier | CSV, mêmes filtres. |
| `GET /api/clientes/:id` | Atelier | Fiche. |
| `GET /api/clientes/:id/totaux` | Atelier | `{ totalCommandes, totalPaye, totalRestant }` de la cliente. |
| `PATCH /api/clientes/:id` | Atelier | Mêmes champs que la création, tous optionnels (au moins un). |
| `POST /api/clientes/:id/archiver` | Atelier | Archive (aucune suppression physique). |
| `POST /api/clientes/:id/restaurer` | Atelier | Restaure une cliente archivée. |
| `POST /api/clientes/:id/anonymiser` | PDG | Droit à l'effacement : remplace l'identité par des valeurs neutres, supprime mesures, fil d'activité et compte de connexion ; commandes et paiements restent. 409 si une commande est en cours ou si déjà anonymisée ; 403 pour un employé. Irréversible. |
| `POST /api/clientes/:id/inviter` | Atelier | Crée le compte de connexion (identifiant = téléphone) et renvoie un lien d'activation ; 409 si un compte existe déjà. |
| `POST /api/clientes/:id/mesures` | Atelier | Nouvelle prise de mesures (historique conservé ; accepte `Idempotency-Key`) : champs en cm parmi `epaule, poitrine, taille, hanches, longueur, longueurRobe, longueurJupe, longueurPantalon, longueurManche, tourBras, tourCou, tourPoignet, tourCuisse, tourGenou` (0,1 à 300, 2 décimales), `autres?` (objet libre, 20 clés maximum), `notes?`. |
| `GET /api/clientes/:id/mesures` | Atelier | Historique, paginé. |
| `GET /api/clientes/:id/mesures/derniere` | Atelier | Dernière prise de mesures. |
| `GET /api/clientes/:id/mesures/:mesureId` | Atelier | Une prise de mesures. |

## 6. Modèles

Schéma : `modele.schema.js`. Catégories : `ROBE, BOUBOU, ENSEMBLE, PANTALON, CHEMISE, JUPE, KAFTAN, COSTUME, TENUE_TRADITIONNELLE, AUTRE`.

| Route | Accès | Corps / paramètres |
|---|---|---|
| `POST /api/modeles` | Atelier | `{ nom, categorie }` + `description?, prixIndicatif?, photoUrl?` |
| `GET /api/modeles` | Atelier | `?q=`, `categorie=`, `archived=true\|false\|all`, pagination. |
| `GET /api/modeles/:id` | Atelier | Fiche. |
| `PATCH /api/modeles/:id` | Atelier | Mêmes champs, optionnels, plus `publie` (booléen ; 409 sans aucune photo, ou si le modèle est archivé) et `tags` (12 au plus, 30 caractères, doublons ignorés sans tenir compte de la casse). Archiver un modèle le dépublie. |
| `POST /api/modeles/:id/archiver` | Atelier | Archive. |
| `POST /api/modeles/:id/restaurer` | Atelier | Restaure. |
| `POST /api/modeles/:id/photos` | Atelier (`modeles.ecrire`) | Lookbook : `{ image, legende? }` — `image` est un fichier (data URL png/jpeg/webp/gif, signature vérifiée, 2 Mo au plus), jamais une URL externe. 8 photos au plus par modèle (409), ajoutée en dernière position. 409 si le modèle est archivé. |
| `DELETE /api/modeles/:id/photos/:photoId` | Atelier (`modeles.ecrire`) | Retire la photo et son image (204). Retirer la dernière photo d'un modèle publié le dépublie. |
| `PUT /api/modeles/:id/photos/ordre` | Atelier (`modeles.ecrire`) | `{ ids: [...] }` — nouvel ordre ; doit contenir exactement les photos du modèle. La première est la couverture. |
| `GET /api/images/:id` | Atelier (`modeles.lire`) | Octets d'une image du lookbook (type d'origine, `nosniff`, cache privé). 404 si l'image n'est pas de l'atelier du compte. Aucune diffusion publique avant la vitrine (7.2). |

## 7. Commandes, paiements, livraisons et reçus

Schémas : `commande.schema.js`, `paiement.schema.js`, `livraison.schema.js`, `annulation.schema.js`, `recu.schema.js`.

**Règles métier clés.** Une commande ne peut pas être créée pour une cliente archivée ni pour une cliente sans aucune mesure (409, `details.mesureManquante`). Le solde est toujours calculé (`prixTotal` − paiements non annulés), jamais stocké. Un paiement ne peut pas dépasser le solde (409) ni viser une commande annulée. Aucune suppression : les paiements, livraisons et dépenses s'**annulent** avec un motif, et restent visibles dans l'historique. Les écritures sur une commande sont sérialisées (verrou) : deux paiements simultanés ne peuvent pas dépasser le solde.

**Statuts** : `NOUVELLE → EN_CONFECTION → ESSAYAGE ⇄ RETOUCHES → TERMINEE → LIVREE`, `ANNULEE` possible avant `LIVREE`. Toute autre transition répond 409. `LIVREE` et `ANNULEE` sont définitifs.

| Route | Accès | Corps / paramètres |
|---|---|---|
| `POST /api/commandes` | Atelier, idempotente | `{ clienteId, typeVetement, prixTotal, dateLivraisonPrevue }` + `modeleId?, description?, couleur?, tissu?, quantite? (1–50), priorite? ("NORMALE" \| "URGENTE"), dateCommande?, observations?, photoTissuUrl?, photoModeleUrl?, paiementInitial? { montant, mode, reference?, commentaire? }` → `201` avec `totalPaye`, `solde`, `statutPaiement`. Numéro généré (`CMD-AAAA-NNNN`). |
| `GET /api/commandes` | Atelier | `?q=` (numéro, nom, téléphone), `statut`, `priorite`, `clienteId`, `assigneA` (`moi`, `aucun` ou un identifiant d'employé), `enRetard=true`, `livraisonDu`, `livraisonAu`, pagination. Chaque ligne porte `totalPaye`, `solde`, `statutPaiement`, `enRetard`, `assigneA`. |
| `GET /api/commandes/export` | Atelier | CSV, mêmes filtres. |
| `GET /api/commandes/production` | Permission `commandes.affecter` | Production : `employes` (actifs, avec `ouvertes` et `enRetard`), `nonAffectees`, `nonAffecteesEnRetard`, `enRetard`, `ouvertes`. Aucun montant. |
| `GET /api/commandes/:id` | Atelier | Détail avec cliente, modèle, historique complet des paiements et des livraisons (annulés compris), `assigneA`, `affectations` (historique) et `totalPaye`, `solde`. |
| `GET /api/commandes/:id/fiche-pdf` | Atelier | Fiche de commande en PDF. `?langue=fr|en` facultatif (sinon la langue du compte). |
| `PATCH /api/commandes/:id` | Atelier | Champs modifiables : `modeleId, typeVetement, description, couleur, tissu, quantite, priorite, dateLivraisonPrevue, observations, photoTissuUrl, photoModeleUrl`. Le prix et la cliente ne se modifient pas. |
| `PUT /api/commandes/:id/affectation` | Permission `commandes.affecter` | `{ employeId }` (employé actif ou PDG de l'atelier, ou `null` pour retirer) — commandes ouvertes seulement (409 sinon) ; historisé ; répéter la même affectation renvoie `dejaTraite: true`. |
| `POST /api/commandes/:id/statut` | Atelier | `{ statut, statutAttendu? }` — transition contrôlée. `statutAttendu` (facultatif, utilisé par les écritures rejouées hors ligne) : si le statut actuel est différent, **409** `details.code = "STATUT_CHANGE"` et rien n'est modifié. Accepte `Idempotency-Key`. |
| `POST /api/commandes/:commandeId/paiements` | Atelier, idempotente | `{ montant, mode ("ESPECES" \| "MOBILE_MONEY" \| "VIREMENT" \| "AUTRE") }` + `reference?, commentaire?`. 409 si le montant dépasse le solde. |
| `GET /api/commandes/:commandeId/paiements` | Atelier | Paiements de la commande, annulés compris (avec motif), paginés. |
| `GET /api/commandes/:commandeId/paiements/:paiementId` | Atelier | Un paiement. |
| `POST /api/commandes/:commandeId/paiements/:paiementId/annuler` | Atelier | `{ motif }` (3 à 500 caractères). 409 si déjà annulé. |
| `POST /api/commandes/:commandeId/paiements/:paiementId/recu` | Atelier | Émet le reçu du paiement (un seul par paiement, 409 sinon). |
| `GET /api/commandes/:commandeId/paiements/:paiementId/recu` | Atelier | Reçu du paiement. |
| `POST /api/commandes/:commandeId/livraisons` | Atelier, idempotente | `{ }` + `dateLivraison?, commentaire?, paiementFinal?` (paiement du solde, atomique). Passe la commande à `LIVREE`. |
| `GET /api/commandes/:commandeId/livraisons` | Atelier | Livraisons de la commande. |
| `GET /api/commandes/:commandeId/livraisons/:livraisonId` | Atelier | Une livraison. |
| `POST /api/commandes/:commandeId/livraisons/:livraisonId/annuler` | Atelier | `{ motif }`. |
| `POST /api/commandes/:commandeId/recus` | Atelier | Émet un reçu de commande (corps vide). |
| `GET /api/commandes/:commandeId/recus` | Atelier | Reçus de la commande. |

Listes globales, toutes commandes confondues, en lecture seule :

| Route | Accès | Paramètres |
|---|---|---|
| `GET /api/paiements` | Atelier¹ | `?q=`, `mode=`, `dateFrom`, `dateTo`, pagination. |
| `GET /api/livraisons` | Atelier¹ | `?q=`, `dateFrom`, `dateTo`, pagination. |
| `GET /api/recus` | Atelier | `?q=`, `dateFrom`, `dateTo`, pagination. |
| `GET /api/recus/:id` | Atelier | Un reçu. |
| `GET /api/recus/:id/pdf` | Atelier | Reçu en PDF. `?langue=fr|en` facultatif (sinon la langue du compte). |

## 8. Dépenses

Schéma : `depense.schema.js`.

| Route | Accès | Corps / paramètres |
|---|---|---|
| `POST /api/depenses` | Atelier, idempotente | `{ categorie, montant }` + `date?, description?, justificatifUrl?` |
| `GET /api/depenses` | Atelier | `?q=`, `categorie=`, `dateFrom`, `dateTo`, pagination (annulées comprises). |
| `GET /api/depenses/stats` | Atelier | `?categorie`, `dateFrom`, `dateTo` → totaux hors dépenses annulées. |
| `GET /api/depenses/export` | Atelier | CSV. |
| `GET /api/depenses/:id` | Atelier | Une dépense. |
| `POST /api/depenses/:id/annuler` | Atelier | `{ motif }`. |

## 9. Stock

Schéma : `articleStock.schema.js`. Unités : `METRE, PIECE, KG, LITRE, ROULEAU, PAQUET, AUTRE`.

| Route | Accès | Corps / paramètres |
|---|---|---|
| `POST /api/stock` | Atelier | `{ nom }` + `categorie?, unite? (défaut PIECE), seuilAlerte?, prixUnitaire?, notes?, quantiteInitiale?` |
| `GET /api/stock` | Atelier | `?q=`, `categorie=`, `archived=true\|false\|all`, pagination. |
| `GET /api/stock/alertes` | Atelier | Articles actifs ayant un seuil d'alerte et dont la quantité est au seuil ou en dessous. |
| `GET /api/stock/export` | Atelier | CSV. |
| `GET /api/stock/:id` | Atelier | Article avec quantité courante. |
| `PATCH /api/stock/:id` | Atelier | Champs de l'article, optionnels (409 si archivé). La quantité ne se modifie que par mouvement. |
| `POST /api/stock/:id/archiver` | Atelier | Archive. |
| `POST /api/stock/:id/restaurer` | Atelier | Restaure. |
| `GET /api/stock/:id/mouvements` | Atelier | Historique des mouvements, paginé. |
| `POST /api/stock/:id/mouvements` | Atelier, idempotente | `{ type ("ENTREE" \| "SORTIE"), quantite }` + `motif?`. 409 si l'article est archivé ou si la quantité est insuffisante pour une sortie. |

## 9 bis. Fournisseurs

Permissions `fournisseurs.lire` (GET) et `fournisseurs.ecrire` (autres méthodes) pour un employé ; le PDG a tout. Aucune donnée financière.

| Route | Accès | Corps / paramètres |
|---|---|---|
| `POST /api/fournisseurs` | Atelier | `{ nom }` + `contact?, telephone?, email?, adresse?, notes?`. 409 si le nom existe déjà dans l'atelier (casse ignorée, archivés compris). |
| `GET /api/fournisseurs` | Atelier | `?q=` (nom, contact, téléphone, email), `archived=true|false|all`, pagination. |
| `GET /api/fournisseurs/:id` | Atelier | Fiche (archivé compris). |
| `PATCH /api/fournisseurs/:id` | Atelier | Mêmes champs, optionnels. 409 si archivé. |
| `POST /api/fournisseurs/:id/archiver` | Atelier | Archive (jamais de suppression). |
| `POST /api/fournisseurs/:id/restaurer` | Atelier | Restaure. |

## 9 ter. Achats aux fournisseurs

Droits d'un employé : `achats.lire` (consulter), `achats.recevoir` (réceptionner, sans voir les prix), `achats.ecrire` (créer, modifier, annuler ; sensible, implique `finances.voir` et `achats.recevoir`). Payer exige en plus `depenses.ecrire`. Sans `finances.voir`, `prixUnitaire`, `montantTotal`, `statutPaiement`, `depense` et `depenseId` sont retirés des réponses. Les états de réception (`AUCUNE`, `PARTIELLE`, `COMPLETE`) et de paiement (`PAYE`, `NON_PAYE`) et le total sont toujours calculés, jamais stockés.

| Route | Accès | Corps / paramètres |
|---|---|---|
| `POST /api/achats` | `achats.ecrire`, idempotente | `{ fournisseurId, lignes: [{ articleId, quantite, prixUnitaire }] }` (1 à 50 lignes, un article une seule fois) + `dateAttendue?, notes?`. Total ≤ 10 000 000. 409 si fournisseur ou article archivé. Numéro `ACH-AAAA-NNNN`. |
| `GET /api/achats` | `achats.lire` | `?q=` (numéro, fournisseur), `statut=COMMANDE\|ANNULE`, `reception=attendu\|complete`, `paiement=paye\|nonpaye`, `fournisseurId`, pagination. |
| `GET /api/achats/options` | `achats.ecrire` | Fournisseurs et articles actifs (`id`, `nom`, `unite`) pour le formulaire de création ; aucun prix. |
| `GET /api/achats/:id` | `achats.lire` | Détail : fournisseur, lignes (`quantiteRecue`, `quantiteRestante`), dépense liée. |
| `PATCH /api/achats/:id` | `achats.ecrire` | `dateAttendue?` (`null` pour l'effacer), `notes?`. Les lignes et les prix ne se modifient pas : annuler et recréer. 409 si annulé. |
| `POST /api/achats/:id/receptions` | `achats.recevoir` ou `achats.ecrire`, idempotente | `{ lignes: [{ ligneId, quantite }] }` — réception totale ou partielle ; crée une entrée de stock par ligne dans la même transaction. 409 si la quantité dépasse le reste à recevoir, si l'achat est annulé ou l'article archivé. |
| `POST /api/achats/:id/paiement` | `achats.ecrire` + `depenses.ecrire`, idempotente | `{ date? }` — crée la dépense « Achats fournisseurs » du montant total. 409 si déjà payé ou annulé. Si la dépense est annulée ensuite (module Dépenses), l'achat redevient non payé. |
| `POST /api/achats/:id/annuler` | `achats.ecrire` | `{ motif }`. 409 si de la marchandise a été reçue ou si l'achat est payé (annuler d'abord la dépense). |

## 9 quater. Vitrine publique

Réglages réservés au PDG ; lecture publique **sans compte**, limitée à 120 requêtes par minute et par IP (429 au-delà) sur la page du catalogue. Les réponses publiques sont construites champ par champ (liste blanche) : jamais d'identifiant d'atelier, de prix, de client, de stock, ni de modèle non publié ou archivé. Vitrine désactivée, atelier suspendu et adresse inconnue donnent le **même** 404.

| Route | Accès | Corps / paramètres |
|---|---|---|
| `GET /api/vitrine` | PDG | `{ slug, vitrineActive, vitrineDescription, couleurPrincipale, vitrineContact, demandesEnLigne, modelesPublies }`. |
| `PATCH /api/vitrine` | PDG | `slug?` (3–40, minuscules, chiffres, tirets ; mots réservés refusés ; unique sur la plateforme, 409 sinon), `vitrineActive?` (exige un identifiant), `vitrineDescription?` (1 500 caractères, `null` pour effacer), `couleurPrincipale?` (`#RRGGBB`, refusée si un texte blanc n'y est pas lisible : contraste WCAG ≥ 4,5), `vitrineContact?` (montrer téléphone, adresse, ville), `demandesEnLigne?` (recevoir les demandes des visiteurs ; exige la vitrine active). |
| `GET /api/public/vitrines/:slug` | Public | `?q=`, `categorie=`, `tag=`, `page`, `pageSize` (≤ 50). `{ atelier: { nom, slogan, description, couleur, logo, contact }, modeles: [{ id, nom, categorie, description, tags, photos: [{ url, legende }] }], meta }`. `contact` vaut `null` tant que le PDG ne l'a pas choisi. Cache public 60 s. |
| `GET /api/public/vitrines/:slug/logo` | Public | Logo de l'atelier comme image. |
| `GET /api/public/vitrines/:slug/images/:imageId` | Public | Photo d'un modèle **publié** de cette vitrine seulement ; 404 sinon (brouillon, archivé, autre atelier). Cache public 5 min. |
| `POST /api/public/vitrines/:slug/demandes` | Public (5 par heure et par IP) | Demande de commande d'un visiteur **sans compte**, si le PDG a activé les demandes en ligne (sinon le même 404 qu'une vitrine inconnue) : `{ prenom, nom, telephone, consentement: true }` + `modeleId?` (modèle publié de la vitrine), `description?` (1 000 caractères), `siteWeb` (piège à robots : doit rester vide, sinon la demande est ignorée sans erreur). Réponse `201 { ok: true }` — jamais d'identifiant. Consentement exactement `true` (400 sinon). Même personne et même modèle déjà en attente : pas de doublon ; 3 demandes par numéro et par jour et 50 demandes en attente par atelier au plus (429). Ne crée ni commande ni fiche cliente. Conservation : voir docs/PHASE7-ANALYSE.md §9. |

## 10. Tableau de bord, rapports et notifications

Périodes : `period=today\|week\|month\|quarter\|year`, ou `from` et `to` (dates ; `to` ≥ `from`).

| Route | Accès | Paramètres → réponse |
|---|---|---|
| `GET /api/dashboard/summary` | Atelier | `period` ou `from`/`to` → clientes actives, commandes (créées sur la période ; en cours, terminées, livrées, en retard, non payées à l'instant T), encaissements, dépenses, résultat de trésorerie. |
| `GET /api/dashboard/recent` | Atelier | `?limit=` (1–50, défaut 10) → dernières commandes, paiements, livraisons, dépenses (annulés exclus). |
| `GET /api/dashboard/commandes/en-retard` | Atelier (`dashboard.lire` + `commandes.lire`) | Pagination → mêmes données et même format que `/api/rapports/commandes/en-retard`, sans exiger `rapports.lire` (tableau de bord d'une réceptionniste). |
| `GET /api/dashboard/commandes/a-livrer` | Atelier (`dashboard.lire` + `commandes.lire`) | `?horizonJours=`, pagination → mêmes données que `/api/rapports/commandes/a-livrer`. |
| `GET /api/rapports/finances` | Atelier | Période → total commandé, encaissé, dépenses, solde ; avec une période, comparaison à la période précédente (`variation`). |
| `GET /api/rapports/evolution` | Atelier | `from`, `to` → série mensuelle (commandes, encaissements, dépenses), plafonnée à 60 mois. |
| `GET /api/rapports/commandes` | Atelier | Période → répartition par statut, priorité et type de vêtement. |
| `GET /api/rapports/commandes/en-retard` | Atelier | Pagination → commandes dont la livraison prévue est dépassée. |
| `GET /api/rapports/commandes/a-livrer` | Atelier | `?horizonJours=` (1–90, défaut 7), pagination. |
| `GET /api/rapports/clientes` | Atelier | Période → clientes actives et archivées, nouvelles et ayant commandé, meilleures clientes par nombre de commandes. |
| `GET /api/rapports/modeles` | Atelier | Catalogue par catégorie (hors période), modèles les plus utilisés dans les commandes de la période. |
| `GET /api/rapports/avances/production` | Atelier (`rapports.avances`) | `?period=|from=&to=`. Par employé : commandes ouvertes qui lui sont confiées, dont en retard (instantané du jour), livraisons de la période et part livrée à l'heure ; commandes ouvertes non affectées. Aucun montant. |
| `GET /api/rapports/avances/retards` | Atelier (`rapports.avances`) | `?period=|from=&to=`. Commandes ouvertes en retard (par statut, par priorité, 20 plus anciennes) et ponctualité des livraisons de la période (taux à l'heure, retard moyen en jours). Même définition du retard que la production (jour UTC). |
| `GET /api/rapports/avances/achats-fournisseurs` | Atelier (`rapports.avances` + `finances.voir`) | `?period=|from=&to=`. Par fournisseur : achats (hors annulés), annulés, valeur commandée, reçue, payée, reste à payer. |
| `GET /api/rapports/avances/depenses-categories` | Atelier (`rapports.avances` + `finances.voir`) | `?period=|from=&to=`. Dépenses non annulées par catégorie : nombre, total, part en %, dont achats fournisseurs. |
| `GET /api/rapports/avances/marges` | Atelier (`rapports.avances` + `finances.voir`) | `?period=|from=&to=`. Marge simple = valeur des commandes (hors annulées) − dépenses ; taux ; solde de caisse ; valeur par type de vêtement. Ordre de grandeur, pas une marge comptable. |
| `GET /api/notifications` | Atelier (`notifications.lire`) | `?lu=true\|false`, pagination. Réconcilie les alertes avant de répondre : `RETARD`, `PRET`, `LIVRAISON_PROCHE`, `IMPAYE`, `TACHE_AFFECTEE` (travail confié, vue par l'employé concerné seul), `STOCK_BAS` (avec la quantité actuelle), `ACHAT_EN_RETARD`. Chaque personne ne reçoit que ce que ses droits permettent (voir docs/PHASE6-ANALYSE.md §13). `lu` est celui de la personne : drapeau partagé pour le PDG, individuel pour un employé. |
| `GET /api/notifications/nombre-non-lues` | Atelier | `{ count, notifications, demandes }` (alertes non lues + demandes en attente) — sondée toutes les 60 s par l'interface. |
| `PATCH /api/notifications/:id` | Atelier | `{ lu: boolean }` — pour la personne connectée seulement (un employé ne modifie jamais l'état du PDG). 404 si la notification n'est pas dans sa vue. |
| `POST /api/notifications/marquer-lu` | Atelier | `{ ids: [...] }` (1 à 200). Un identifiant hors de la vue de la personne (autre atelier compris) est ignoré. |
| `POST /api/notifications/supprimer` | PDG | `{ ids: [...] }` (1 à 200). Réservé au PDG (agit sur tout l'atelier) ; l'alerte réapparaît tant que sa cause existe. |

## 11. Paramètres de l'atelier et abonnement

| Route | Accès | Corps |
|---|---|---|
| `GET /api/parametres` | Atelier¹ | Informations de l'atelier. |
| `PUT /api/parametres` | Atelier | Remplacement : `{ nom, devise }` + `logoUrl?, telephone?, adresse?, slogan?, recuConfig?`. |
| `PATCH /api/parametres` | Atelier | Mêmes champs, tous optionnels. |
| `GET /api/abonnements/etat` | Atelier¹ | État d'abonnement : `statut` (`ACTIF`, `EN_ATTENTE`, `ESSAI`, `EXPIRE`, `SUSPENDU`, `AUCUN`), essai, abonnement courant, `acces` (`mode` : `COMPLET`, `GRACE` ou `LECTURE_SEULE`, avec la fin de grâce) et `paiementEnAttente` (déclaration non encore tranchée, ou `null`). |
| `GET /api/abonnements/utilisation` | Atelier (PDG) | Consommation des quotas de la formule : `quotasAppliques`, `raison` (`ESSAI`, `ABONNEMENT`, `GRACE`, `SUSPENDU`, `ILLIMITE`, `AUCUN`), `formule`, `jauges` (une par ressource : `cle`, `usage`, `limite` ou `null` si illimitée, `etat` : `illimite`, `ok`, `proche`, `atteint`, `depasse`, `plancherApplique`). |
| `POST /api/abonnements/souscrire` | Atelier¹, idempotente | `{ planId, dureeMois, moyenPaiement ("MOBILE_MONEY" \| "NITA" \| "AMANA" \| "VIREMENT" \| "ESPECES" \| "AUTRE") }` + `operateur?, reference` (obligatoire sauf espèces), `preuveNote?`. Déclare un paiement fait hors plateforme ; **n'accorde aucun accès** avant confirmation. Le montant est calculé par le serveur (un champ `montant` est refusé). La durée doit être proposée par la formule. 409 si une déclaration est déjà en attente. → `201 { id, numero, statut, montant }`. |
| `POST /api/abonnements/payer-wave` | Atelier¹, idempotente | `{ planId, dureeMois }` — ouvre un paiement Wave et renvoie `201 { id, numero, statut, montant, checkoutUrl }` (adresse où envoyer l'utilisateur). **503 tant que Wave n'est pas activé** (`paiementsEnLigne.wave` de `/etat`). N'active rien : l'abonnement n'est activé que lorsque le serveur a relu le paiement chez Wave. |
| `POST /api/abonnements/transactions/:id/verifier` | Atelier¹ | Demande au serveur de relire un paiement Wave chez Wave (à appeler au retour du navigateur). Le corps est ignoré : aucune affirmation du client n'est prise en compte. 503 si Wave est injoignable ou inactif. |
| `GET /api/abonnements/transactions` | Atelier¹ | Historique des paiements de l'atelier (déclarés, confirmés, rejetés, remboursés), avec la facture éventuelle. |
| `POST /api/abonnements/transactions/:id/annuler` | Atelier¹ | Retire une déclaration en attente. 409 si elle est déjà traitée ; la répéter est sans effet. |
| `GET /api/abonnements/factures/:id/pdf` | Atelier¹ | Justificatif de paiement en PDF (404 si la facture appartient à un autre atelier). |
| `GET /api/plans-abonnement` | Session | Formules PROPOSÉES (actives ET avec au moins un prix) : `offres` (`MENSUEL` 1 mois, `ANNUEL` 12 mois, prix entiers en XOF), économie annuelle informative, quotas, fonctionnalités. |

## 12. Demandes de commande

Une cliente propose une commande (côté Cliente) ; l'atelier la traite. L'acceptation **lie** une commande créée séparément par `POST /api/commandes`, elle n'en crée pas.

| Route | Accès | Corps / paramètres |
|---|---|---|
| `GET /api/demandes` | Atelier | `?statut=EN_ATTENTE\|ACCEPTEE\|REFUSEE`, pagination. |
| `GET /api/demandes/:id` | Atelier | Une demande. |
| `POST /api/demandes/:id/accepter` | Atelier | `{ commandeId }` — la commande doit appartenir au même atelier **et** à la même cliente. 409 si la demande n'est plus en attente. |
| `POST /api/demandes/:id/cliente` | Atelier (`demandes.ecrire` + `clientes.ecrire`) | Rattache une demande de la vitrine à une fiche cliente : crée la fiche depuis les coordonnées du visiteur, ou réutilise la fiche portant le même téléphone (`clienteExistante`) ; 409 si cette fiche est archivée. Efface les coordonnées de la demande. Répétable (`dejaTraite`). `accepter` exige ensuite cette fiche (409 `clienteRequise` avant). |
| `POST /api/demandes/:id/refuser` | Atelier | `{ motifRefus? }` |

## 13. Espace cliente finale (`/api/moi`) — Cliente

Une cliente ne voit que ses propres données.

| Route | Accès | Description |
|---|---|---|
| `GET /api/moi` | Cliente | Profil et atelier. |
| `GET /api/moi/mesures` | Cliente | Ses mesures. |
| `GET /api/moi/commandes` | Cliente | Ses commandes avec payé et reste (liste complète, non paginée : `{ data }`). |
| `GET /api/moi/commandes/:id` | Cliente | Une de ses commandes avec l'historique de ses paiements et livraisons (404 si elle n'est pas à elle). |
| `GET /api/moi/paiements` | Cliente | Ses paiements. |
| `GET /api/moi/notifications` | Cliente | Ses notifications. |
| `GET /api/moi/notifications/non-lues` | Cliente | Nombre de notifications non lues. |
| `PATCH /api/moi/notifications/:id` | Cliente | Marque une notification lue ou non lue. |
| `POST /api/moi/demandes` | Cliente | `{ description? , modeleId? }` — propose une commande à l'atelier. |
| `GET /api/moi/demandes` | Cliente | Ses demandes. |
| `POST /api/moi/commandes/:id/recus` | Cliente | Demande l'émission du reçu d'une de ses commandes. |
| `GET /api/moi/recus` | Cliente | Ses reçus. |
| `GET /api/moi/recus/:id/pdf` | Cliente | Un de ses reçus en PDF (dans la langue de son compte, ou `?langue=fr|en`). |
| `GET /api/moi/export` | Cliente | Télécharge SES données (profil, mesures, commandes avec paiements et livraisons, reçus, demandes, activité) en JSON. 10 par heure et par IP. |
| `POST /api/moi/suppression` | Cliente | `{ motDePasse }` — ferme son compte (session comprise) et marque la fiche « effacement demandé » ; 400 si mot de passe incorrect. 5 par heure et par IP. |

## 14. Administration de la plateforme — SuperAdmin

Aucune de ces routes ne donne accès aux données métier d'un atelier (clientes, commandes…) : pour intervenir, le SUPERADMIN démarre une impersonation, journalisée.

| Route | Accès | Corps / paramètres |
|---|---|---|
| `GET /api/ateliers` | SuperAdmin | `?q=`, pagination. |
| `POST /api/ateliers` | SuperAdmin | Crée un atelier et son compte ADMIN : `{ nom, adminIdentifiant, adminPassword }` + `devise?, telephone?, adresse?`. |
| `GET /api/ateliers/resume` | SuperAdmin | Totaux de la plateforme (ateliers, comptes, clientes, commandes…). |
| `GET /api/ateliers/tendances` | SuperAdmin | Évolution sur 6 mois (inscriptions, revenus d'abonnement de la plateforme). |
| `GET /api/ateliers/alertes` | SuperAdmin | Nouveaux ateliers (7 jours), abonnements expirés ou expirant sous 7 jours, ateliers suspendus. Recalculé à chaque appel. |
| `GET /api/ateliers/abonnements` | SuperAdmin | État d'abonnement de chaque atelier (`ACTIF`, `EN_ATTENTE`, `ESSAI`, `EXPIRE`, `AUCUN`). |
| `GET /api/ateliers/:id` | SuperAdmin | Fiche d'un atelier. |
| `PATCH /api/ateliers/:id` | SuperAdmin | `{ nom?, devise?, telephone?, adresse?, ville?, pays? }` |
| `PATCH /api/ateliers/:id/statut` | SuperAdmin | `{ actif: boolean }` — suspend ou réactive (effet immédiat sur toutes les sessions). |
| `GET /api/ateliers/:id/activite` | SuperAdmin | Fil d'activité (connexions…). |
| `GET /api/ateliers/:id/impersonations` | SuperAdmin | Journal des impersonations de l'atelier. |
| `POST /api/ateliers/:id/comptes` | SuperAdmin | Ajoute un compte ADMIN : `{ identifiant, password }` + `prenom?, nom?, email?`. |
| `DELETE /api/ateliers/:id/comptes/:userId` | SuperAdmin | Retire un compte (refusé si l'atelier n'aurait plus aucun compte) → `204`. |
| `PATCH /api/ateliers/:id/comptes/:userId/mot-de-passe` | SuperAdmin | `{ nouveauMotDePasse }` — invalide les sessions du compte. |
| `POST /api/ateliers/:id/comptes/:userId/impersonation` | SuperAdmin | Ouvre une session limitée dans le temps sous l'identité du compte ; journalisée. |
| `DELETE /api/ateliers/:id` | SuperAdmin | Supprime un atelier **vide** (aucune cliente, modèle, commande, dépense ni abonnement), sinon 409 : suspendre plutôt → `204`. |
| `GET /api/ateliers/:atelierId/abonnement` | SuperAdmin | Abonnements de l'atelier. |
| `GET /api/ateliers/:atelierId/utilisation` | SuperAdmin | Consommation des quotas d'un atelier (même forme que `/api/abonnements/utilisation`). |
| `POST /api/ateliers/:atelierId/abonnement/activer` | SuperAdmin, idempotente | `{ planId }` + `dateDebut?`, et `dureeMois` (1–60) **ou** `dateExpiration`, `note?`. Activation manuelle. |
| `PATCH /api/ateliers/:atelierId/abonnement/:abonnementId` | SuperAdmin | `{ planId?, dateDebut?, dateExpiration?, note? }` |
| `POST /api/ateliers/:atelierId/abonnement/:abonnementId/expirer` | SuperAdmin | `{ note? }` — met fin à l'abonnement maintenant. |
| `POST /api/ateliers/:atelierId/abonnement/:abonnementId/desactiver` | SuperAdmin | `{ note? }` |
| `POST /api/ateliers/:atelierId/abonnement/:abonnementId/suspendre` | SuperAdmin | `{ note }` (motif obligatoire) — pause : l'abonnement garde ses dates mais l'atelier passe en lecture seule immédiatement, sans grâce. Répétable. |
| `POST /api/ateliers/:atelierId/abonnement/:abonnementId/reactiver` | SuperAdmin | `{ note }` — remet un abonnement suspendu en service. Répétable. |
| `GET /api/plans-abonnement/tous` | SuperAdmin | Tous les plans, actifs ou non, avec `proposee`, `offres`, `quotasNonDefinis` et `activationPossible` (`AUCUN_TARIF`, `QUOTAS_NON_DEFINIS`). |
| `GET /api/plans-abonnement/:id/abonnes` | SuperAdmin | Ateliers actuellement abonnés à la formule (abonnement en cours), prix figé, période, revenu mensuel récurrent. Lecture seule. |
| `GET /api/plans-abonnement/:id/depassements` | SuperAdmin | Ateliers dont l'usage actuel dépasse déjà les limites de cette formule (aide à la décision, lecture seule). |
| `POST /api/plans-abonnement` | SuperAdmin | `{ nom }` + `description?, prixMensuel?, prixAnnuel?` (entiers XOF > 0, `null` = période non proposée), `fonctionnalites? (20 max), limites? (clé absente = non définie, null = illimité explicite), ordre?, actif? (défaut false)`. Créer ou activer exige un tarif ET quatre quotas définis (409 `details.activation`). |
| `PATCH /api/plans-abonnement/:id` | SuperAdmin | Mêmes champs. Passer `actif` à `true` exige un tarif ET quatre quotas définis (409). |
| `GET /api/plateforme/contact` | SuperAdmin | Numéro WhatsApp de contact de la plateforme. |
| `PUT /api/plateforme/contact` | SuperAdmin | `{ whatsapp }` (8 à 15 chiffres avec indicatif). |
| `GET /api/plateforme/transactions` | SuperAdmin | `?statut=EN_ATTENTE\|REUSSIE\|ECHOUEE\|ANNULEE\|EXPIREE\|REMBOURSEE`, `atelierId=`, pagination. Paiements d'abonnement de tous les ateliers, avec le nom de l'atelier. |
| `POST /api/plateforme/transactions/:id/confirmer` | SuperAdmin | `{ note? }` — après rapprochement avec le relevé : active l'abonnement (début à l'échéance en cours s'il y en a une, aucun jour perdu) et émet la facture. Répéter l'appel renvoie `dejaTraitee: true` sans rien refaire. 409 si la transaction n'est plus en attente ou si le moyen est Wave. |
| `POST /api/plateforme/transactions/:id/rejeter` | SuperAdmin | `{ motif }` — transaction `ECHOUEE`, abonnement annulé. Répétable. |
| `POST /api/plateforme/transactions/:id/rembourser` | SuperAdmin | `{ motif }` — enregistre un remboursement **total** (l'argent est rendu hors plateforme) : transaction `REMBOURSEE`, facture marquée annulée (conservée), abonnement annulé. Répétable. 409 si le paiement n'est pas réussi. |
| `GET /api/plateforme/factures/:id/pdf` | SuperAdmin | Justificatif de paiement en PDF. |
| `GET /api/plateforme/parametres-abonnement` | SuperAdmin | `{ joursGrace, instructionsPaiement }` — jours d'accès complet après l'échéance avant la lecture seule (7 par défaut). |
| `PUT /api/plateforme/parametres-abonnement` | SuperAdmin | `{ joursGrace?, instructionsPaiement? }` : jours de grâce (entier de 0 à 90) et/ou texte « où et comment payer » (1000 caractères maximum, vide = effacer), affiché aux ateliers dans `/api/abonnements/etat`. Au moins un champ. |
| `GET /api/plateforme/commerce/synthese` | SuperAdmin | Tableau de bord commercial : ateliers par état d'abonnement (`ACTIF`, `ESSAI`, `EN_ATTENTE`, `EXPIRE`, `SUSPENDU`, `AUCUN`) et par mode d'accès, revenus du mois et du mois précédent, cumul, revenu mensuel récurrent, paiements à vérifier (nombre, montant, plus ancien), anomalies Wave, conversion des essais et taux de renouvellement sur 90 jours. |
| `GET /api/plateforme/commerce/revenus` | SuperAdmin | `?mois=12` (1 à 36), `atelierId=` — série mensuelle (encaissé à la date de confirmation, remboursé à la date de remboursement, net), totaux, ventilation par formule et par moyen de paiement, et abonnements activés à la main **sans paiement enregistré** (non comptés en revenus). |
| `GET /api/plateforme/commerce/renouvellements` | SuperAdmin | `?jours=30` (1 à 180) — ateliers à relancer : échéance dans l'horizon (renouvellements planifiés pris en compte), abonnements récemment expirés non repris, essais qui se terminent ; avec contact de l'atelier et indicateur de paiement déjà déclaré ; taux de renouvellement. |
| `GET /api/plateforme/journal-securite` | SuperAdmin | `?evenement=`, `atelierId=`, `userId=`, pagination (50 par défaut). |

## 15. Webhook de paiement

| Route | Accès | Description |
|---|---|---|
| `POST /api/webhooks/wave` | Signature Wave | Appelé par Wave, sans cookie. Authentifié par l'en-tête `Wave-Signature` (HMAC-SHA256, tolérance 5 minutes). `401` signature invalide ; `503` Wave non activé ou relecture impossible (Wave réessaie pendant 3 jours) ; `200` événement pris en compte ou sans objet. Le contenu n'est qu'un déclencheur : la session est relue chez Wave avant toute confirmation. Chaque événement n'a d'effet qu'une fois. |

## 16. Ce qui n'est pas exposé

- Le paiement en ligne par Wave est **inactif par défaut** : `WAVE_ENABLED=1`, `WAVE_API_KEY` et `WAVE_WEBHOOK_SECRET` doivent tous être définis (voir `.env.example`). Sinon les routes Wave répondent 503 sans rien traiter.
- Toute route `/api/*` inconnue répond `404 { "error": "Route API inconnue." }`.

## 17. Constats relevés pendant la rédaction

- `GET /api/paiements` et `GET /api/livraisons` (listes globales) ne vérifient pas l'abonnement (« Atelier¹ ») alors que leurs équivalents par commande, et `GET /api/recus`, le font. Une fois l'essai terminé sans abonnement, ces deux listes restent lisibles. Comportement actuel conservé : à décider s'il est voulu.
