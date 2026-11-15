# AM Couture — Documentation complète du projet

> Plateforme SaaS multi-ateliers de gestion pour ateliers de couture.
> Document rédigé à partir de l'analyse du code (backend, frontend, schéma Prisma, migrations, CI) — état au 14 novembre 2026.

---

> **Note** : ce document décrit l'état du projet avant la phase 2 de sécurisation. Plusieurs points de la section 10.1 (alertes de dépendances, politique de mot de passe, journalisation, sauvegarde) ont depuis été traités : voir `docs/SECURITE.md` pour l'état actuel.

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture technique](#2-architecture-technique)
3. [Rôles et permissions](#3-rôles-et-permissions)
4. [Modèle de données](#4-modèle-de-données)
5. [Modules et fonctionnalités existantes](#5-modules-et-fonctionnalités-existantes)
6. [Abonnement, essai gratuit et facturation](#6-abonnement-essai-gratuit-et-facturation)
7. [Sécurité et fiabilité](#7-sécurité-et-fiabilité)
8. [Tests, CI/CD et déploiement](#8-tests-cicd-et-déploiement)
9. [Fonctionnalités manquantes](#9-fonctionnalités-manquantes)
10. [Améliorations nécessaires](#10-améliorations-nécessaires)
11. [Recommandations d'évolution (feuille de route)](#11-recommandations-dévolution-feuille-de-route)
12. [Annexes](#12-annexes)

---

## 1. Vue d'ensemble

**AM Couture — Gestion d'Atelier** est une application web (PWA installable) qui permet à des ateliers de couture de gérer toute leur activité : clients et mesures, commandes, paiements et reçus, livraisons, dépenses, stock, rapports et notifications. Chaque atelier est un **tenant** isolé ; une console **SuperAdmin** administre l'ensemble de la plateforme (ateliers, abonnements, tarifs). Les **clients finaux** disposent d'un espace personnel pour suivre leurs commandes et envoyer des demandes.

| Élément | Valeur |
|---|---|
| Public cible | Ateliers de couture (marché ouest-africain : FCFA, Wave, Orange Money, WhatsApp) |
| Type | SaaS multi-tenant, abonnement mensuel/multi-mois |
| Langues | Français (complet), anglais ; le haoussa est listé mais non traduit |
| Premier tenant | « AM Couture » (l'application est générique, ce n'est pas son nom) |
| Taille approximative | ~28 500 lignes de JS/JSX, 25 tables, 24 fichiers de routes API |

---

## 2. Architecture technique

### 2.1 Pile technologique

| Couche | Technologie |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router 7, TanStack Query 5, Zustand 5, Zod, lucide-react |
| PWA | `vite-plugin-pwa` / Workbox (installable, précache) |
| Backend | Node 22, Express 5 (ESM), Zod pour la validation, `pdfkit` pour les PDF |
| Base de données | PostgreSQL (Neon) via Prisma 7 + `@prisma/adapter-pg` |
| Authentification | JWT dans un cookie HTTP-only, `bcryptjs` |
| Fichiers | Images stockées en data URL base64 dans PostgreSQL (aucun service de stockage externe) |
| Emails | Resend (API REST directe, sans SDK) |
| Hébergement | Vercel (frontend statique + Function `api/index.js` + Cron) |
| CI | GitHub Actions (lint oxlint, build, tests unitaires, tests d'intégration sur Postgres jetable) |

### 2.2 Structure du dépôt

```
AM_Couture/
├── api/index.js              Point d'entrée Vercel Function (réexporte backend/src/app.js)
├── backend/src/
│   ├── app.js                Application Express (sans listen)
│   ├── server.js             Serveur de dev local uniquement
│   ├── routes/               24 routeurs (un par module)
│   ├── schemas/              Schémas Zod (validation + règles métier)
│   ├── middlewares/          auth.middleware.js, error.middleware.js
│   ├── lib/                  Logique transverse (money, period, trial, abonnement,
│   │                         notifications, PDF, CSV, emails, rate limiter, payments/…)
│   └── integration-tests/    Tests multi-tenant contre une vraie base
├── frontend/src/
│   ├── features/             19 modules (api.js + hooks.js + pages + components)
│   ├── pages/                Dashboard, Finances, auth/, superadmin/
│   ├── layouts/              AppLayout, ClientLayout, SuperadminLayout
│   ├── components/           22 composants partagés
│   ├── i18n/                 fr.js, en.js + parts/ par domaine
│   ├── stores/               Zustand (locale, thème, UI, abonnement)
│   └── routes/               ProtectedRoute, PublicOnlyRoute, RoleGuards
├── prisma/                   schema.prisma, 21 migrations, seeds
├── vercel.json               Build, rewrites, cron quotidien
└── .github/workflows/ci.yml
```

### 2.3 Principes d'architecture notables

- **Frontend et API sur le même domaine** : pas de CORS ; en dev, le proxy Vite redirige `/api` vers `:4000`.
- **Valeurs dérivées jamais stockées** : le statut de paiement d'une commande, le solde, « actif/expiré » d'un abonnement sont recalculés à la lecture (aucune divergence possible).
- **Annulation logique** : paiements, livraisons et dépenses ne sont jamais supprimés, ils sont annulés avec trace.
- **Écritures imbriquées** : paiements, livraisons et reçus ne s'écrivent que via `/api/commandes/:id/…` ; les routes globales (`/api/paiements`, `/api/livraisons`, `/api/recus`) sont en lecture seule.
- **Numérotation atomique** via la table `Counter` (CMD-2026-0001, REC-…, ABN-…, TRX-…).
- **Événements client figés** : `NotificationClient` stocke des événements au moment où ils se produisent (dans la même transaction que l'écriture), contrairement aux notifications ADMIN qui sont recalculées.

---

## 3. Rôles et permissions

| Rôle | Rattachement | Accès |
|---|---|---|
| `SUPERADMIN` | Aucun atelier | Console plateforme : ateliers, abonnements, tarifs, impersonation |
| `ADMIN` | Exactement 1 atelier | Toutes les données de son atelier (soumis à l'abonnement actif) |
| `USER` | 1 atelier **et** 1 cliente | Uniquement ses propres données (filtrage par `clienteId`, pas seulement `atelierId`) |

Middlewares : `requireAuth`, `requireAtelier` (vérifie aussi que l'atelier n'est pas suspendu, à **chaque** requête), `requireAbonnementActif` (renvoie **402** si l'essai est terminé sans abonnement), `requireSuperadmin`, `requireClient`.

---

## 4. Modèle de données

25 tables Prisma. Regroupement fonctionnel :

| Domaine | Modèles |
|---|---|
| Identité | `User`, `TokenAction` (vérification email, reset mot de passe, invitation client), `LimiteTaux`, `JournalImpersonation` |
| Tenant | `Atelier` (identité, devise, `recuConfig`, suspension, `trialEndsAt`) |
| Clientèle | `Cliente`, `Mesure`, `Modele` |
| Commandes | `Commande`, `DemandeCommande`, `Paiement`, `Livraison`, `Recu` |
| Notifications | `Notification` (ADMIN, recalculée), `NotificationClient` (événements figés) |
| Finances & stock | `Depense`, `ArticleStock`, `MouvementStock` |
| Abonnement | `FormuleAbonnement`, `PlanAbonnement`, `Abonnement`, `Transaction`, `HistoriqueAbonnement`, `ParametresPlateforme` |
| Technique | `Counter` |

Énumérations clés : statuts de commande (`NOUVELLE → EN_CONFECTION → ESSAYAGE → RETOUCHES → TERMINEE → LIVREE`, ou `ANNULEE`), priorité (`NORMALE`/`URGENTE`), modes de paiement (`ESPECES`, `MOBILE_MONEY`, `VIREMENT`, `AUTRE`), 10 catégories de vêtements, unités de stock.

---

## 5. Modules et fonctionnalités existantes

### 5.1 Espace atelier (rôle ADMIN)

| Module | Fonctionnement |
|---|---|
| **Tableau de bord** | Synthèse filtrable par période : commandes en cours/prêtes/en retard/non payées, encaissements, dépenses, résultat de trésorerie, commandes récentes, livraisons à venir. |
| **Clients** | Fiche cliente (actives/archivées), recherche, export CSV, historique de commandes avec totaux payés/restants, mesures corporelles par groupes (buste, taille, longueurs…) versionnées, rappel WhatsApp en un clic, **invitation par lien** pour créer un compte client. |
| **Modèles** | Catalogue par catégorie, photo, prix indicatif, statistiques d'usage, archivage/restauration. |
| **Commandes** | Création avec cliente/modèle/mesures (mesure requise, testée en intégration), statuts avec transitions contrôlées, priorité, photos tissu/modèle, fiche PDF imprimable, recherche, export CSV. |
| **Paiements & reçus** | Paiements multi-modes, acomptes et échelonnement, solde recalculé, annulation tracée, reçu PDF personnalisable (Orange Money, RIB, mentions légales). |
| **Livraisons** | Enregistrement pour une commande terminée, annulation logique. |
| **Dépenses** | Catégories, justificatif, statistiques, export CSV, annulation logique. |
| **Stock** | Articles par unité (mètre, pièce, kg…), mouvements entrée/sortie tracés, seuil d'alerte, bandeau d'alerte, archivage, export CSV. |
| **Demandes de commande** | Les clients USER envoient des demandes ; l'ADMIN les accepte (création automatique de la commande) ou les refuse avec motif. |
| **Rapports** | Finances avec comparaison à la période précédente (variation en %), évolution sur 12 mois, répartition par statut/priorité/catégorie, commandes en retard / à livrer, top clients et modèles. |
| **Notifications** | Retard, prête à récupérer, livraison sous 3 jours, impayée — recalculées en continu, marquage lu/supprimé. |
| **Calendrier** | Vue mensuelle des livraisons prévues. |
| **Paramètres** | Nom, logo, devise, coordonnées, slogan, thème, mentions des reçus. |
| **Mon compte** | Changement de mot de passe (révoque les autres sessions), langue. |
| **Abonnement** | Affichage de l'état (essai, actif, expiré), formules et contact WhatsApp de la plateforme pour souscrire. |
| **Auth libre-service** | Inscription d'atelier, vérification d'email, mot de passe oublié, bandeau de vérification. |

### 5.2 Espace client final (rôle USER)

Profil, mesures, liste et détail des commandes, paiements, reçus (PDF), fil de notifications avec compteur de non-lues, création et suivi de demandes de commande. Activation du compte via lien d'invitation.

### 5.3 Console plateforme (rôle SUPERADMIN)

| Module | Fonctionnement |
|---|---|
| **Vue d'ensemble** | Nouveaux ateliers, abonnements expirés ou proches de l'expiration, ateliers suspendus, tendances sur 6 mois. |
| **Ateliers** | Création, recherche, fiche détaillée (activité, comptes, statistiques), suspension/réactivation immédiate, suppression des ateliers vides. |
| **Comptes** | Ajout/retrait de comptes par atelier, réinitialisation de mot de passe. |
| **Impersonation** | Connexion « en tant que » un compte d'atelier, journalisée, avec bandeau et retour en un clic. |
| **Abonnements** | Activation **manuelle**, modification, expiration, désactivation, historique par atelier. |
| **Tarification** | Formules par durée (1/3/6/12 mois) avec remises, plans avec fonctionnalités, contact WhatsApp configurable. |
| **Navigation mobile** | Barre de navigation du bas à 5 onglets (ajoutée récemment, commit `a5b961f`). |

### 5.4 Automatisations

- **Cron Vercel quotidien (07:00)** : `GET /api/cron/rappels-quotidiens` recalcule les notifications et envoie un email récapitulatif aux ateliers actifs ayant des éléments à traiter. Protégé par `CRON_SECRET` (503 si absent).
- **Purge opportuniste** de la table de rate-limiting (2 % des appels).

---

## 6. Abonnement, essai gratuit et facturation

1. **Essai gratuit de 15 jours** posé à la création de l'atelier (`trialEndsAt`). Les ateliers antérieurs (`trialEndsAt = null`) ne sont jamais bloqués.
2. **Fin d'essai sans abonnement** : les routes métier répondent **402**, le frontend affiche un bandeau de paywall.
3. **Activation manuelle par le SuperAdmin** (virement, espèces, Wave hors plateforme) avec plan, durée, dates ; possibilité de planifier une activation future.
4. **États dérivés** : `ACTIF`, `EN_ATTENTE`, `ESSAI`, `EXPIRE`, `AUCUN`, calculés à la lecture ; arithmétique calendaire (`setUTCMonth`).
5. **Historique immuable** (`HistoriqueAbonnement`) de chaque action.
6. **Couche de paiement en ligne dormante** : `lib/payments/` (Wave, Nita, Amanata), `lib/wave.js`, `webhooks.routes.js` et le modèle `Transaction` existent mais **ne sont pas montés** ; aucun paiement en ligne n'est actif.

---

## 7. Sécurité et fiabilité

**Points forts**

- Isolation multi-tenant sur toutes les données, vérifiée par tests d'intégration (IDOR, frontières de rôles).
- Cookie JWT HTTP-only ; `sessionVersion` pour révoquer les sessions à distance.
- Rate-limiting **persistant** en base (UPSERT atomique), efficace en serverless.
- Suspension d'atelier effective à chaque requête.
- Impersonation journalisée.
- Jetons à usage unique pour email/reset/invitation.
- Webhook Wave prévu avec signature HMAC sur le corps brut.
- Emails : échec explicite plutôt que simulation silencieuse.
- Cron fail-closed.
- Contrôle d'accès lié à l'abonnement appliqué côté serveur.

**Points d'attention** : voir §10.

---

## 8. Tests, CI/CD et déploiement

| Type | Contenu | Volume |
|---|---|---|
| Unitaires (`npm test`) | csv, dates, décimaux, ids, money, period, phone, trial, zodHelpers, schémas auth et atelierAdmin | ~139 cas |
| Intégration (`npm run test:integration`) | isolation tenant, frontières de rôles, essai/abonnement, abonnement manuel, notifications client, mesure requise | ~52 cas |
| CI | lint → build → tests unitaires → intégration sur Postgres jetable (jamais Neon) | GitHub Actions |

**Déploiement** : push GitHub → Vercel exécute `scripts/vercel-build.mjs` (migrations en production uniquement ; procédure et retour arrière : `docs/DEPLOIEMENT.md`). Variables : `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CRON_SECRET` (+ clés de paiement réservées).

**Démarrage local** : `npm install`, copier `.env.example` vers `.env`, `npx prisma generate`, `npx prisma migrate dev`, puis `npm run dev:backend` (:4000) et `npm run dev:frontend` (:5173).

---

## 9. Fonctionnalités manquantes

### 9.1 Priorité haute (valeur métier directe)

| # | Fonctionnalité | Pourquoi |
|---|---|---|
| 1 | **Paiement en ligne de l'abonnement** (Wave/Orange Money) | Aujourd'hui tout passe par le SuperAdmin : goulot d'étranglement et friction à la conversion. La couche existe mais est dormante. |
| 2 | **Gestion des employés / couturiers** | Un seul compte ADMIN par atelier utile ; pas d'affectation des commandes à un couturier, ni de suivi de charge ou de commission. |
| 3 | **Droits fins par compte** (caissier, couturier, lecture seule) | Aujourd'hui tout ADMIN voit les finances. |
| 4 | **Notifications sortantes automatiques au client** (WhatsApp/SMS) | Le rappel WhatsApp est un lien manuel ; pas d'envoi automatique « commande prête ». |
| 5 | **Sauvegarde / export global des données** d'un atelier | Seuls des exports CSV par module existent. |

### 9.2 Priorité moyenne

- Traduction **haoussa** (listé mais absent) et complétude de l'anglais sur tous les écrans.
- **Devis / factures** distincts des reçus ; numérotation fiscale.
- **Gestion des retouches et essayages** planifiés (rendez-vous, rappel).
- **Liaison stock ↔ commande** : consommation automatique de tissu par commande.
- **Fournisseurs** et bons d'achat liés aux dépenses/stock.
- **Remises, promotions, fidélité** clients.
- **Galerie / lookbook public** et page vitrine de l'atelier.
- **Recherche globale** et filtres avancés enregistrés.
- **Historique d'audit** consultable côté atelier (qui a modifié quoi).
- **Authentification renforcée** : 2FA (au moins pour SUPERADMIN), connexion par téléphone/OTP.
- **Facturation côté plateforme** : factures PDF d'abonnement, relances d'expiration automatiques aux ateliers, codes promo.

### 9.3 Priorité basse / confort

- Mode hors-ligne réel (la PWA précache, mais la saisie hors-ligne n'est pas gérée).
- Impression d'étiquettes et QR code de suivi par commande.
- Import CSV (clients, stock) à l'onboarding.
- Multi-boutiques par atelier, multi-devises.
- API publique / webhooks pour intégrations tierces.

---

## 10. Améliorations nécessaires

### 10.1 Sécurité et conformité (à traiter en premier)

- **Vulnérabilités de dépendances** : GitHub signale 24 alertes (1 critique, 9 hautes, 9 moyennes, 5 faibles). Les passer en revue via Dependabot et mettre à jour.
- **Politique de mot de passe** : minimum 8 caractères uniquement sur le reset ; le login n'impose rien (normal) mais la création de comptes devrait imposer complexité ou liste de mots de passe courants.
- **Confidentialité / RGPD-équivalent** : pas de page de politique de confidentialité, de conditions d'utilisation, ni de procédure de suppression/export des données personnelles d'une cliente.
- **Upload d'images en base64 dans le JSON** (limite 5 Mo) : valider type MIME réel et dimensions côté serveur, envisager à terme un stockage objet (le base64 en base alourdit la base et les sauvegardes).
- **Domaine d'expédition email** : le repli `onboarding@resend.dev` est inadapté à la production (délivrabilité). Vérifier un domaine propre.
- **Secrets** : confirmer que `.env.local` et `.env` ne sont jamais commités et faire une rotation si besoin.

### 10.2 Cohérence et dette technique

- **Commentaire obsolète** : `schema.prisma` mentionne un essai de « 7 jours » alors que le code applique **15 jours** (`atelierProvisioning.js`). Aligner.
- **README partiellement périmé** : il décrit encore le paiement Wave avec webhook automatique pour l'abonnement ; ce n'est plus le cas (activation manuelle). Il omet aussi l'espace client (rôle USER), les demandes de commande et la navigation mobile SuperAdmin. Remplacer par ce document ou le mettre à jour.
- **Numérotation globale** des commandes (CMD-2026-0001 partagée entre ateliers) : un atelier voit des numéros non consécutifs et peut déduire le volume des autres. Passer à un compteur **par atelier**.
- **Code dormant** : `lib/payments/`, `lib/wave.js`, `webhooks.routes.js`, `Transaction`, variables d'environnement de paiement. Soit les activer (§11), soit isoler pour éviter la confusion.
- **Absence de fichier de configuration ESLint** (le projet utilise oxlint) : documenter ce choix ; `npx eslint` échoue.
- **Fichiers de log versionnés ou traînant** (`backend_dev.log`, `frontend_dev.log`) et dossier `.agents/` non suivi : les ajouter au `.gitignore`.
- **Écritures CRLF/LF** : avertissements Git répétés ; ajouter un `.gitattributes` (`* text=auto eol=lf`).

### 10.3 Qualité, tests et observabilité

- **Couverture de tests** : les tests d'intégration couvrent surtout isolation et abonnement. Manquent : paiements/solde, transitions de statut de commande, stock (mouvements négatifs), reçus PDF, demandes de commande, cron, auth (reset, vérification), rate limiter.
- **Aucun test frontend** (ni unitaire ni E2E). Ajouter Vitest + Testing Library pour les formulaires critiques, et Playwright pour 3-4 parcours (inscription → commande → paiement → reçu ; client USER ; SuperAdmin activation).
- **Journalisation et monitoring** : pas de suivi d'erreurs (Sentry), pas de logs structurés, pas d'alerte sur l'échec du cron ou des emails.
- **Typage** : projet en JS pur. Introduire JSDoc strict ou migrer progressivement vers TypeScript, au moins pour `lib/` et `schemas/`.

### 10.4 Performance et passage à l'échelle

- **Calcul des notifications à la lecture** (`reconcilierNotifications`) et boucle séquentielle d'envoi d'emails dans le cron : acceptable aujourd'hui, risque de dépasser la durée maximale d'une Function Vercel avec beaucoup d'ateliers. Découper par lots ou passer par une file.
- **Dashboard et rapports** : plusieurs agrégations par requête ; ajouter des index composites (`atelierId, statut`, `atelierId, dateLivraisonPrevue`, `atelierId, createdAt` sur Paiement/Depense) et envisager un cache court.
- **Pagination** : vérifier qu'elle existe sur toutes les listes et exports (les exports CSV peuvent être volumineux : passer en streaming).
- **Bundle frontend** : avertissement de taille de chunk au build ; mettre en place le code-splitting par route (`React.lazy`) — toutes les pages sont importées statiquement dans `App.jsx`.
- **Connexions Neon** : `connection_limit=1` en pooler est adapté au serverless, à surveiller sous charge.

### 10.5 UX et accessibilité

- Terminer le **responsive mobile** : la barre du bas SuperAdmin vient d'être ajoutée ; vérifier le même niveau de finition sur tous les écrans (tableaux → cartes) et tester à 320 px sur appareil réel.
- Compléter l'**internationalisation** : les fichiers de traduction couvrent 7 domaines ; vérifier qu'aucun texte français n'est codé en dur dans les pages restantes.
- **Accessibilité** : audit contraste (thème sombre), focus clavier, `aria-*` sur les menus, lecteurs d'écran.
- **États vides et onboarding** : assistant de première configuration (logo, devise, premier modèle, première cliente) après l'inscription.
- **Confirmations** et annulation d'action (undo) sur les opérations sensibles.

---

## 11. Recommandations d'évolution (feuille de route)

### Phase 1 — Assainir (1 à 2 semaines)

1. Traiter les 24 alertes Dependabot (critique et hautes d'abord).
2. Corriger les incohérences (essai 7/15 jours, README, `.gitignore`, `.gitattributes`).
3. Ajouter Sentry (ou équivalent) et un monitoring du cron.
4. Domaine email vérifié sur Resend.
5. Pages légales (CGU, confidentialité).

### Phase 2 — Fiabiliser (2 à 4 semaines)

1. Étendre les tests d'intégration (paiements, statuts, stock, demandes, auth).
2. Tests E2E Playwright sur les parcours critiques, branchés sur la CI.
3. Code-splitting des routes, index composites, pagination/streaming des exports.
4. Numérotation par atelier.

### Phase 3 — Monétiser (4 à 6 semaines)

1. **Paiement en ligne de l'abonnement** : monter le webhook Wave (déjà conçu avec HMAC), gérer `Transaction`, renouvellement et relances d'expiration automatiques.
2. Factures PDF d'abonnement et codes promo.
3. Tableau de bord plateforme enrichi : MRR, churn, conversion essai → payant.

### Phase 4 — Étendre le métier (6 à 12 semaines)

1. **Équipe** : comptes couturiers, droits par rôle, affectation des commandes, suivi de production.
2. **Notifications automatiques** WhatsApp Business / SMS aux clients (prête, rappel de solde, essayage).
3. Liaison stock ↔ commande, fournisseurs, devis et factures.
4. Rendez-vous d'essayage avec calendrier et rappels.

### Phase 5 — Différencier (continu)

- Page vitrine/lookbook par atelier et prise de commande en ligne par les clientes.
- Mode hors-ligne avec synchronisation.
- Haoussa et autres langues locales.
- API publique et intégrations comptables.

### Indicateurs à suivre

Ateliers inscrits / actifs, conversion essai → abonnement, durée moyenne d'abonnement, commandes créées par atelier et par semaine, taux d'erreur API, temps de réponse du dashboard, part des clients utilisant l'espace USER.

---

## 12. Annexes

### 12.1 Cartographie des routes API

| Préfixe | Accès | Contenu |
|---|---|---|
| `/api/auth` | public / connecté | login, inscription atelier, vérification et renvoi d'email, mot de passe oublié, reset par jeton, activation compte client, logout, quitter impersonation, `me`, branding par identifiant |
| `/api/clientes` (+ `/:id/mesures`) | ADMIN + abonnement | CRUD, export, totaux, archiver/restaurer, inviter |
| `/api/modeles` | ADMIN + abonnement | CRUD, archiver/restaurer |
| `/api/commandes` (+ paiements, livraisons, recus) | ADMIN + abonnement | CRUD, export, fiche PDF, changement de statut, paiements, livraisons, reçus |
| `/api/paiements`, `/api/livraisons`, `/api/recus` | ADMIN | Lecture globale, détail, PDF |
| `/api/depenses` | ADMIN + abonnement | CRUD, stats, export, annulation |
| `/api/stock` | ADMIN + abonnement | Articles, alertes, export, mouvements |
| `/api/demandes` | ADMIN + abonnement | Liste, détail, accepter, refuser |
| `/api/dashboard`, `/api/rapports` | ADMIN + abonnement | Lecture seule |
| `/api/notifications` | ADMIN + abonnement | Liste, compteur, lu, suppression |
| `/api/parametres` | ADMIN | Lecture ; modification soumise à l'abonnement |
| `/api/compte` | connecté | Profil, mot de passe |
| `/api/abonnements/etat` | ADMIN | État d'abonnement de l'atelier |
| `/api/plans-abonnement` | connecté / SUPERADMIN | Lecture publique des plans ; gestion SUPERADMIN |
| `/api/plateforme/contact` | SUPERADMIN | Contact WhatsApp |
| `/api/ateliers` | SUPERADMIN | Gestion des ateliers, comptes, impersonation, activité, tendances, alertes, abonnements |
| `/api/moi` | USER | Profil, mesures, commandes, paiements, reçus, notifications, demandes |
| `/api/cron` | secret | Rappels quotidiens |

### 12.2 Variables d'environnement

| Variable | Rôle | Obligatoire |
|---|---|---|
| `DATABASE_URL` | Connexion poolée Neon (runtime) | Oui |
| `DIRECT_URL` | Connexion directe (migrations) | Oui |
| `JWT_SECRET` | Signature des sessions | Oui |
| (supprimée : jamais utilisée)
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Emails | Oui pour emails |
| `CRON_SECRET` | Authentifie le cron | Oui pour rappels |
| `SEED_*` | Amorçage des comptes initiaux | Dev / premier déploiement |
| `WAVE_*`, `NITA_API_KEY`, `AMANATA_API_KEY` | Paiement en ligne (réservé) | Non (dormant) |

### 12.3 Historique récent (commits)

Activation manuelle des abonnements → page « Tarification » → durées avec remises et contact WhatsApp configurable → page des formules au style « tarifs » → navigation mobile SuperAdmin.

### 12.4 Limites de ce document

Rédigé à partir de la lecture du code et de la structure du projet, sans exécution de l'application en conditions réelles. Les volumes de tests et de lignes sont des ordres de grandeur. La complétude de la traduction anglaise et la couverture exacte de la pagination n'ont pas été vérifiées écran par écran.
