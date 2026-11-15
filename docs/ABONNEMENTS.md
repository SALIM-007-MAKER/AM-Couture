# Abonnements, paiements et facturation — référence

Ce document décrit le système d'abonnement tel qu'il est **dans le code** à la fin de la phase 5. Les routes sont dans [API.md](API.md) ; l'analyse de départ, les décisions et les limites sont dans [PHASE5-ANALYSE.md](PHASE5-ANALYSE.md) ; le bilan est dans [BILAN-PHASE5.md](BILAN-PHASE5.md).

## 1. Principes

1. **Aucun paiement n'est confirmé sur la foi d'un navigateur.** Un atelier *déclare* un paiement ; seule la décision du SUPERADMIN (paiement manuel) ou la relecture d'un paiement chez Wave par le serveur l'active.
2. **Le prix est toujours calculé par le serveur**, d'après la formule et la durée. Un montant envoyé par le client est refusé.
3. **Rien ne se supprime.** Rejet, annulation, expiration et remboursement sont des changements d'état datés, signés, motivés et historisés.
4. **Chaque décision n'agit qu'une fois**, même rejouée ou simultanée (verrous, états relus sous verrou, événements dédoublonnés).
5. **Aucune donnée d'atelier n'est jamais supprimée ni masquée** parce qu'un abonnement se termine : l'atelier passe en lecture seule.

## 2. Données

| Table | Rôle |
|---|---|
| `PlanAbonnement` | Formule : nom, prix mensuel, fonctionnalités (texte), remises par durée, `limites` (structure prévue, **non appliquée**), actif |
| `Abonnement` | Période d'accès d'un atelier : formule et durée figées, prix figé, dates, statut (`EN_ATTENTE`, `CONFIRME`, `ANNULE`, `SUSPENDU`) |
| `Transaction` | Un paiement d'abonnement : moyen, montant, statut, qui l'a déclaré et quand, qui l'a tranché et quand, motifs de rejet et de remboursement, référence chez le prestataire |
| `FactureAbonnement` | Justificatif numéroté (`FAC-AAAA-NNNN`), **immuable** : instantané de l'atelier, de la formule, de la période et du montant au jour de l'émission |
| `HistoriqueAbonnement` | Journal de chaque action sur un abonnement (souscription, confirmation, rejet, suspension, remboursement…) |
| `RappelAbonnement` | Rappel déjà envoyé (unique par atelier, type et échéance) |
| `EvenementPaiement` | Événement de prestataire déjà traité (unique par fournisseur et identifiant d'événement) |
| `ParametresPlateforme` | Jours de grâce, instructions de paiement, contact WhatsApp |
| `JournalSecurite` | Événements `ABONNEMENT_*` (déclaration, confirmation, rejet, remboursement, suspension, anomalie Wave) |

Contraintes en base : une seule transaction `EN_ATTENTE` par abonnement (index unique partiel), montants strictement positifs (`CHECK … NOT VALID`).

## 3. États

**État d'abonnement d'un atelier** (jamais stocké, recalculé à chaque lecture) : `ACTIF`, `EN_ATTENTE` (activation planifiée), `ESSAI`, `EXPIRE`, `SUSPENDU`, `AUCUN` (atelier antérieur à l'essai gratuit). Priorité : actif > planifié > suspendu > essai > expiré.

**Transaction** : `EN_ATTENTE` → `REUSSIE` → `REMBOURSEE`, ou `EN_ATTENTE` → `ECHOUEE` (rejet), `ANNULEE` (retrait par l'atelier), `EXPIREE` (Wave : session expirée ou jamais créée). Toute autre transition est refusée (409).

## 4. Accès selon l'état

| Situation | Accès |
|---|---|
| Essai de 15 jours en cours ; abonnement actif ; atelier antérieur à l'essai | **Complet** |
| Fin d'essai ou d'abonnement depuis moins de `joursGrace` jours (7 par défaut, 0 à 90) | **Complet**, avec bandeau ambre |
| Au-delà de la grâce | **Lecture seule** : consultation, exports CSV et PDF ; toute écriture refusée (402) |
| Abonnement suspendu par la plateforme (hors essai en cours) | **Lecture seule immédiate**, sans grâce |
| Impersonation SUPERADMIN | Jamais restreint |

Restent possibles en lecture seule : l'état « lu » des notifications, le compte (langue, mot de passe), la page Abonnement, la souscription, les justificatifs.

## 5. Parcours

### 5.1 Paiement manuel vérifié (actif)

1. L'atelier choisit une formule et une durée proposée (`/abonnement`), lit les **instructions de paiement** saisies par la plateforme, paie hors de l'application, puis déclare : moyen, opérateur, **référence** (obligatoire sauf espèces).
2. Une transaction `EN_ATTENTE` est créée ; **aucun accès n'est accordé**. Le SUPERADMIN est prévenu par courriel s'il a une adresse.
3. Le SUPERADMIN ouvre **Paiements** (`/paiements-abonnement`), rapproche la référence et le montant de son relevé, puis **confirme** ou **rejette** (motif obligatoire).
4. À la confirmation : l'abonnement devient `CONFIRME`, la facture est émise, l'atelier est prévenu par courriel. Le début est **maintenant**, ou **l'échéance de l'abonnement en cours** (voir §6).

### 5.2 Wave (préparé, **inactif**)

Actif seulement si `WAVE_ENABLED=1`, `WAVE_API_KEY` et `WAVE_WEBHOOK_SECRET` sont définis. L'atelier est envoyé sur la page de paiement Wave ; le webhook signé (`POST /api/webhooks/wave`) n'est qu'un déclencheur : le serveur **relit la session chez Wave** puis compare session, référence, montant et devise ; au moindre écart rien n'est activé (anomalie journalisée, visible dans le tableau de bord). Un rattrapage quotidien et le bouton « Vérifier maintenant » relisent les sessions en attente. **Aucun appel à l'API Wave réelle n'a jamais été fait** : voir §10.

## 6. Renouvellement

Souscrire alors qu'un abonnement court encore : le nouvel abonnement **commence à l'échéance en cours** (aucun jour perdu). Une chaîne de renouvellements est traitée comme une seule couverture pour les rappels et le tableau de bord ; un renouvellement qui démarre moins d'un jour après l'échéance prolonge la couverture.

## 7. Rejets, annulations, remboursements

- **Rejet** (SUPERADMIN, motif obligatoire) : transaction `ECHOUEE`, abonnement annulé, aucun accès.
- **Retrait** par l'atelier d'une déclaration non traitée : transaction `ANNULEE`. Impossible pour un paiement Wave (il se clôt tout seul).
- **Remboursement** (SUPERADMIN, motif obligatoire, **total uniquement**) : transaction `REMBOURSEE`, facture marquée annulée (conservée), abonnement annulé. Pour un paiement manuel, **la plateforme enregistre le remboursement ; l'argent est rendu hors de l'application**. Pour Wave, Wave rembourse d'abord ; s'il refuse, rien n'est enregistré.
- **Suspension** d'un abonnement (SUPERADMIN, motif obligatoire) : lecture seule immédiate ; réversible.

## 8. Rappels

Tâche quotidienne (`/api/cron/rappels-quotidiens`, 07 h UTC) : essai à 3 et 1 jours, abonnement à 7, 3 et 1 jours de la fin de la chaîne, et un message à la fin (grâce, lecture seule, rien n'est supprimé). Un seul rappel par échéance ; aucun pour un paiement déjà déclaré, un atelier suspendu ou une échéance ancienne. Détail et garanties : PHASE5-ANALYSE.md §10.

## 9. Traçabilité

Pour toute opération financière : qui (`declarePar`, `confirmePar`, `rembourseePar`), quand, pourquoi (motifs), sur quelle référence ; `HistoriqueAbonnement` (par abonnement), `JournalSecurite` (événements `ABONNEMENT_*`, conservé 365 jours), journaux d'exécution structurés (`docs/JOURNALISATION.md`), `donneesBrutesWebhook` (session Wave relue, conservée pour audit).

## 10. Exploitation

### Réglages (SUPERADMIN → Tableau commercial)
Jours de grâce ; **instructions de paiement** (à renseigner avant d'ouvrir la souscription : sans elles l'atelier voit « contactez la plateforme »).

### Tarifs
Les formules et leurs prix sont gérés dans **Tarification**. Les valeurs présentes à la livraison sont des **valeurs de départ à vérifier** : je n'ai pas lu celles de votre base de production.

### Vérification quotidienne
Ouvrir **Paiements** (filtre « En attente ») : rapprocher chaque référence du relevé, confirmer ou rejeter. Un paiement non traité laisse l'atelier en attente ; le tableau commercial indique le nombre et l'ancienneté du plus ancien.

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `CRON_SECRET` | Authentifie la tâche quotidienne (rappels, rattrapage Wave, purges) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `PUBLIC_APP_URL` | Courriels (rappels, décisions). Sans clé, rien n'est envoyé mais aucune opération n'échoue |
| `WAVE_ENABLED`, `WAVE_API_KEY`, `WAVE_WEBHOOK_SECRET` | Active Wave (les trois). `PUBLIC_APP_URL` doit être en **https** |

### Justificatif de paiement
Le PDF s'intitule « Justificatif de paiement d'abonnement » et ne porte **aucune mention légale** (identifiant fiscal, registre de commerce, adresse du siège) : elles sont à saisir dans `backend/src/lib/facturePdf.js` (`EMETTEUR`) avant tout usage comptable.

### Mise en service d'un paiement manuel
1. Vérifier les tarifs ; saisir les instructions de paiement ; choisir les jours de grâce.
2. Compléter les mentions légales du justificatif ; configurer l'envoi de courriels (domaine vérifié).
3. Avant le déploiement : point de restauration Neon (4 migrations de la phase 5, toutes additives).
4. Faire un premier cycle réel avec un atelier test : déclarer, confirmer, télécharger le justificatif, rembourser.

### Activation de Wave (à ne faire qu'après confirmation par Wave)
1. Obtenir de Wave la confirmation que le service est disponible dans votre pays, un compte Business et les frais.
2. Déclarer chez Wave le webhook `https://<domaine>/api/webhooks/wave` (secret de **signature**).
3. Définir les trois variables ; faire un essai réel d'un très petit montant (la documentation Wave ne décrit pas de bac à sable) et vérifier : session créée, webhook reçu, abonnement activé, facture émise, remboursement.
4. Surveiller `anomaliesWave` dans le tableau commercial.

## 11. Limites connues

- Le rapprochement d'un paiement manuel est **humain** : aucune API d'opérateur n'est disponible (NITA, Amana, Airtel, Moov, Orange : aucune documentation publique trouvée).
- Remboursement total seulement ; un abonnement planifié à la suite d'un abonnement remboursé garde ses dates (un trou peut subsister).
- Les revenus ne comptent que les paiements enregistrés ; les activations manuelles sans paiement sont signalées à part.
- Limites chiffrées par formule : structure prévue, **non appliquée**.
- Pas de relance d'impayé au-delà des rappels d'échéance ; pas de pénalité ; pas de facturation récurrente automatique (chaque renouvellement est une démarche de l'atelier).
- Durée de grâce unique pour toute la plateforme ; tout est en FCFA.
- Textes de courriels en français uniquement.
