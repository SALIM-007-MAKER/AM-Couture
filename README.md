# AM Couture — Gestion d'Atelier

Plateforme SaaS multi-ateliers de gestion pour ateliers de couture — React/Vite (PWA) + Express + Prisma 7 + PostgreSQL (Neon) + Vercel. Chaque atelier (tenant) gère son activité en autonomie complète ; une console plateforme séparée (SUPERADMIN) administre l'ensemble des ateliers.

## Fonctionnalités

### Côté atelier (compte ADMIN)

**Tableau de bord** — vue d'ensemble filtrable par période : commandes en cours/prêtes/en retard/non payées, encaissements, dépenses, résultat de trésorerie, commandes récentes, alertes livraisons à venir.

**Clients** — fichier clients (actifs/archivés), recherche, export CSV, fiche détaillée avec historique de commandes et totaux payés/restants, prise de mesures corporelles (par groupes : buste, taille, longueurs...), rappel client par WhatsApp en un clic (livraison prête ou solde restant).

**Modèles** — catalogue de modèles par catégorie (robe, boubou, ensemble, tenue traditionnelle...), photo, prix indicatif, statistiques d'utilisation.

**Commandes** — création avec cliente/modèle/mesures, suivi de statut (nouvelle → en confection → essayage → retouches → terminée → livrée, ou annulée), priorité normale/urgente, photos (tissu, modèle souhaité), fiche PDF imprimable, recherche et export CSV.

**Paiements & reçus** — paiements multi-modes (espèces, mobile money, virement), acomptes et paiements échelonnés, solde toujours recalculé automatiquement, annulation logique tracée (jamais de suppression), reçu PDF personnalisable par paiement.

**Livraisons** — enregistrement de la livraison d'une commande terminée, annulation logique en cas d'erreur de saisie.

**Dépenses** — suivi des dépenses de l'atelier par catégorie (tissu, fournitures, charges...), justificatif, statistiques par catégorie, export CSV.

**Stock** — gestion des matières premières et fournitures (tissus, boutons, fil...) par unité (mètre, pièce, kg...), entrées/sorties tracées avec historique, seuil d'alerte par article et bandeau d'alerte automatique, export CSV.

**Rapports** — finances (avec comparaison automatique à la période précédente et variation en %), évolution mensuelle sur 12 mois, répartition des commandes par statut/priorité/catégorie, commandes en retard et à livrer prochainement, top clients et modèles les plus utilisés.

**Notifications** — alertes automatiques recalculées en continu : commande en retard, prête à récupérer, livraison proche (3 jours), impayée.

**Calendrier** — vue mensuelle des livraisons prévues.

**Paramètres** — identité de l'atelier (nom, logo, devise, coordonnées), thème clair/sombre, mentions personnalisées sur les reçus PDF (Orange Money, RIB, mentions légales...).

**Mon compte** — changement de mot de passe (déconnecte les autres sessions ouvertes), préférence de langue (français/anglais).

**Abonnement** — souscription à une formule tarifaire de la plateforme, paiement mobile (Wave) avec confirmation automatique par webhook.

**Multilingue** — interface bilingue français/anglais (tableau de bord, navigation, clients, commandes, rapports, stock, connexion).

**Application installable (PWA)** — thème clair/sombre, utilisable comme application sur mobile et desktop.

### Côté plateforme (compte SUPERADMIN)

**Gestion des ateliers** — création, recherche, fiche détaillée par atelier (activité récente, comptes, statistiques), suspension/réactivation immédiate, suppression définitive des ateliers vides.

**Comptes employés** — ajout/retrait de comptes par atelier, réinitialisation de mot de passe en dernier recours.

**Impersonation** — connexion "en tant que" le compte d'un atelier pour support/débogage, journalisée, avec bandeau visible et retour à la session plateforme en un clic.

**Tarifs & abonnements** — gestion des formules tarifaires, suivi des abonnements et paiements de tous les ateliers, confirmation manuelle des paiements hors Wave (virement, espèces).

**Tableau de bord plateforme** — nouveaux ateliers, abonnements expirés ou proches de l'expiration, ateliers suspendus, tendances (nouveaux ateliers et revenus sur 6 mois), rappels automatiques quotidiens par email aux ateliers ayant des éléments à traiter.

### Sécurité & fiabilité

Isolation stricte par atelier (multi-tenant) sur toutes les données, rate-limiting persistant (survit aux redémarrages/instances serverless), révocation de session à distance (changement de mot de passe, réinitialisation), vérification d'email et mot de passe oublié en libre-service, suite de tests automatisés avec intégration continue (GitHub Actions) sur chaque push.

> Les fonctionnalités email (vérification, mot de passe oublié, rappels automatiques) nécessitent une clé API Resend configurée en production — sans elle, l'envoi échoue explicitement plutôt que d'être simulé.

## Démarrage local

```bash
npm install
cp .env.example .env   # puis renseigner DATABASE_URL / DIRECT_URL (Neon) et JWT_SECRET
npx prisma generate
npx prisma migrate dev # crée le schéma sur votre base Neon de dev

npm run dev:backend    # http://localhost:4000
npm run dev:frontend   # http://localhost:5173 (proxy /api -> :4000)
```

## Structure

- `frontend/` — React + Vite + Tailwind, PWA installable.
- `backend/` — Express, exporté sans `app.listen()` (voir `src/app.js`) ; `src/server.js` = dev local uniquement.
- `api/index.js` — point d'entrée Vercel Function (réexporte `backend/src/app.js`).
- `prisma/schema.prisma` + `prisma.config.ts` — schéma et configuration CLI (Prisma 7, driver adapter `@prisma/adapter-pg`).

## Déploiement

Push sur GitHub → Vercel exécute `scripts/vercel-build.mjs` (migrations appliquées uniquement en production ; voir `docs/DEPLOIEMENT.md`). Variables d'environnement à configurer dans le dashboard Vercel : `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`.
