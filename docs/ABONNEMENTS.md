# Abonnements, paiements et facturation — référence

Ce document décrit le système d'abonnement tel qu'il est **dans le code** à la fin de la phase 5. Les routes sont dans [API.md](API.md) ; l'analyse de départ, les décisions et les limites sont dans [PHASE5-ANALYSE.md](PHASE5-ANALYSE.md) ; le bilan est dans [BILAN-PHASE5.md](BILAN-PHASE5.md).

## 1. Principes

1. **Aucun paiement n'est confirmé sur la foi d'un navigateur.** Un atelier *déclare* un paiement ; seule la décision du SUPERADMIN (paiement manuel) ou la relecture d'un paiement chez Wave par le serveur l'active.
2. **Le prix vient toujours du catalogue, lu par le serveur** (formule et période mensuelle ou annuelle), puis figé dans l'abonnement et la transaction. Un montant envoyé par le client est refusé. Aucun prix n'est écrit dans le code ni proposé par défaut (voir §13).
3. **Rien ne se supprime.** Rejet, annulation, expiration et remboursement sont des changements d'état datés, signés, motivés et historisés.
4. **Chaque décision n'agit qu'une fois**, même rejouée ou simultanée (verrous, états relus sous verrou, événements dédoublonnés).
5. **Aucune donnée d'atelier n'est jamais supprimée ni masquée** parce qu'un abonnement se termine : l'atelier passe en lecture seule.

## 2. Données

| Table | Rôle |
|---|---|
| `PlanAbonnement` | Formule : nom, description, prix mensuel et prix annuel **optionnels** (XOF, entiers), fonctionnalités (texte), `limites` (quotas, voir §12), actif, pays/devise (`NE`/`XOF`). `tarifsDuree` est conservé mais n'alimente plus les offres (voir §13) |
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

1. L'atelier choisit une formule et une période, **mensuelle** (1 mois) ou **annuelle** (12 mois), proposée avec un prix dans le catalogue (`/abonnement`), lit les **instructions de paiement** saisies par la plateforme, paie hors de l'application, puis déclare : moyen, opérateur, **référence** (obligatoire sauf espèces).
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
- Limites chiffrées par formule : **appliquées** depuis les quotas commerciaux (voir §12).
- Pas de relance d'impayé au-delà des rappels d'échéance ; pas de pénalité ; pas de facturation récurrente automatique (chaque renouvellement est une démarche de l'atelier).
- Durée de grâce unique pour toute la plateforme ; tout est en FCFA (Niger uniquement : pas de conversion ni de tarification internationale).
- Textes de courriels en français uniquement.

## 12. Quotas commerciaux des formules

Les formules se différencient **uniquement par des quotas** ; toutes les fonctionnalités restent accessibles. Quatre ressources sont limitées : `clientes`, `employes`, `commandesActives`, `modeles`. Une clé absente = illimité ; valeurs entières de 1 à 1 000 000 (zéro interdit). Les formules (Starter, Professionnel, Premium…) sont **créées à la main par le SUPERADMIN** (Tarification) : aucune migration n'insère de formule ni de donnée commerciale.

Règles : `backend/src/lib/quotas.js` (pures), `backend/src/lib/quotasServeur.js` (comptage, verrous, contrôle).

### Ce qui est compté

| Ressource | Comptage |
|---|---|
| Clientes | fiches non archivées (une fiche anonymisée est archivée) |
| Employés | comptes `EMPLOYE` actifs ; ni le PDG, ni les comptes clientes, ni les employés désactivés |
| Commandes actives | statuts `NOUVELLE`, `EN_CONFECTION`, `ESSAYAGE`, `RETOUCHES`, `TERMINEE` (ni livrées, ni annulées) |
| Modèles | modèles non archivés |

Le plafond technique de 8 photos par modèle (et les autres plafonds techniques) est **indépendant** des quotas.

### Quand les quotas s'appliquent

| Situation | Quotas |
|---|---|
| Essai gratuit en cours | aucun (même si un abonnement est déjà activé) |
| Atelier ancien (sans échéance d'essai) sans abonnement | aucun |
| Abonnement actif | les `limites` **figées** de cet abonnement |
| Période de grâce après un abonnement échu | celles du **dernier abonnement échu** |
| Période de grâce après l'essai, sans abonnement | aucun |
| Lecture seule, suspension | l'écriture est déjà refusée (402) avant tout contrôle de quota |
| Abonnement antérieur aux quotas (`limites` = `{}`) | **illimité** : aucun quota n'est attribué automatiquement |

Les quotas s'appliquent aussi pendant l'usurpation d'identité du SUPERADMIN.

### Figeage dans les abonnements

`Abonnement.limites` (ce que les contrôles appliquent) et `Abonnement.plancher` (plancher d'usage reporté). Modifier une formule du catalogue **ne touche que les futures souscriptions**.
1. **Déclaration** (`souscrire`) : copie des limites de la formule.
2. **Activation** (confirmation d'un paiement, Wave compris, ou activation manuelle) : calcul des limites effectives.
3. **Correction** d'un abonnement activé (`PATCH …/abonnement/:id` avec un autre plan) : limites recalculées depuis la nouvelle formule, **plancher conservé intégralement**, prix inchangé (comme aujourd'hui).
4. Réactivation d'une suspension, expiration, désactivation : les limites ne changent pas.

### Plancher d'usage

Un atelier **ancien** (sans échéance d'essai) qui n'a **jamais eu d'abonnement activé** voit, à sa première activation, son usage réel de chaque ressource enregistré (au moins 1) comme **plancher**, y compris si sa première formule est illimitée. Limite effective = `max(limite de la formule, plancher)`. Le plancher est reporté tel quel à chaque abonnement suivant, **ne se recalcule jamais** et traverse une formule illimitée.

Exemple : Starter (100 clientes), atelier à 140 clientes → limite effective 140 ; renouvellement → 140 ; correction vers Professionnel (500) → 500 ; retour à Starter → 140.

Un atelier qui a bénéficié de l'essai n'a **pas** de plancher : à la fin de l'essai, les quotas de sa formule s'appliquent strictement ; au-dessus d'une limite, seules les nouvelles créations sont refusées. Un atelier ancien qui avait déjà un abonnement activé avant les quotas n'a pas non plus de plancher calculé (règle « première souscription » à la lettre) : voir « Points à connaître » ci-dessous.

### Refus et cohérence

- Refus : **HTTP 409** avec `details.quota = { ressource, limite, usage }`, traité comme une erreur de formulaire (jamais la bannière de lecture seule du 402).
- Points d'entrée contrôlés : création de cliente, de modèle, de commande, d'employé ; **restauration** d'une cliente ou d'un modèle ; **réactivation** d'un employé ; rattachement d'une demande à une **nouvelle** fiche. Archiver, désactiver, modifier, consulter et exporter ne sont jamais contrôlés (archiver libère une place).
- Un atelier au-dessus de sa limite (plancher, formule changée) garde l'usage de tout : seule la création est refusée. **Aucune donnée n'est jamais supprimée, désactivée ou masquée.**
- Cohérence sous requêtes simultanées : verrou consultatif par atelier et par ressource (`quota:<atelier>:<ressource>`), pris dans la transaction de création, puis comptage. **Ordre des verrous : quota d'abord, puis verrous métier** (téléphone, nom de modèle, compteur de numéros) ; plusieurs quotas : ordre alphabétique. Testé : 20 créations simultanées pour 5 places = exactement 5.

### Suivi

- Atelier (PDG) : page Abonnement, section « Utilisation de votre formule » (`GET /api/abonnements/utilisation`) ; avertissement en tête des formulaires de création quand la limite est atteinte.
- SuperAdmin : fiche atelier (utilisation), Tarification (quotas de chaque formule, liste en lecture seule des ateliers qui dépasseraient déjà une formule).

### Points à connaître

- **Abonnements déclarés avant la mise en service** : un paiement déjà déclaré (`EN_ATTENTE`) a `limites` = `{}` ; confirmé, il reste illimité.
- **Atelier ancien ayant un abonnement activé avant les quotas** : à son premier renouvellement vers une formule limitée, aucun plancher n'est calculé (il a déjà eu un abonnement activé) ; ses limites sont celles de la formule, strictes. À arbitrer si ce cas existe en production : une exception « premier abonnement soumis à des limites » serait une modification d'une fonction (`estEligiblePlancher`).
- **Montée en gamme immédiate** : non développée ; un nouvel abonnement prend effet à l'échéance de l'abonnement en cours.
- Les formules inactives ne sont plus proposées, mais restent attachées aux abonnements déjà souscrits.

## 13. Tarification Niger (XOF) : formules mensuelles et annuelles

Périmètre : **Niger uniquement**, franc CFA BCEAO (`XOF`, affiché « FCFA »). Aucun taux de change, aucune conversion, aucune zone tarifaire ; les colonnes `pays`/`devise` ne servent qu'à garder l'architecture extensible. Règles pures : `backend/src/lib/tarifs.js`.

### Catalogue (administré par le SUPERADMIN, « Formules et tarification »)

- `prixMensuel` (1 mois) et `prixAnnuel` (12 mois) : entiers XOF strictement positifs, **tous deux optionnels**. Une période sans prix **n'est pas proposée** ; une formule sans aucun prix n'est pas proposée du tout. Aucun prix par défaut, aucune formule gratuite.
- Le prix annuel est **saisi tel quel** (jamais calculé). L'**économie annuelle** (`mensuel × 12 − annuel`) est calculée automatiquement et affichée **à titre informatif** ; elle n'est jamais stockée ni appliquée.
- Une formule créée est **inactive**. Elle ne peut être **activée** que si elle a au moins un prix valide **et** si ses **quatre quotas sont définis** (une limite entière, ou « illimité » choisi explicitement). Une limite non définie n'est **jamais** traitée comme illimitée pour décider de proposer une formule (409 `details.activation`).
- Formules antérieures (limites `{}`) : non réévaluées tant qu'on ne les réactive pas ; un abonnement qui en dépend reste illimité (voir §12).
- **Avertissement SuperAdmin** : une formule **active** dont des quotas ne sont pas définis affiche un encadré « Quotas non définis : actuellement illimités » (écran « Formules et tarification », `data-testid="avertissement-quotas"`). Tant qu'une limite n'est pas décidée, les ateliers qui souscrivent n'ont **aucune limite** sur cette ressource. L'encadré est informatif : aucune limite n'est jamais attribuée automatiquement.
- Les anciennes durées de 3 et 6 mois et les remises en pourcentage ne sont plus proposées. Les contrats existants gardent leur prix et leur durée figés.
- **Rétro-remplissage du prix annuel** (migration `20261205090000_retro_remplissage_prix_annuel`, données seulement). Avant la tarification Niger, le prix d'une durée était calculé : `prixMensuel × durée × (100 − remise) / 100`, avec `tarifsDuree` = `[{ dureeMois, remisePourcent }]` (vide = durées standard 1, 3, 6, 12 mois sans remise). La migration recopie une fois, dans `prixAnnuel`, ce que cette règle donnait pour 12 mois :
  - jamais d'écrasement : seules les formules à `prixAnnuel` vide sont traitées, donc un second passage ne change rien ;
  - aucun prix inventé : si le prix mensuel est absent, nul ou non entier, si la remise est illisible ou hors 0–90 %, si le calcul ne donne pas un entier de 1 à 99 999 999 (aucun arrondi), la formule reste vide ; si `tarifsDuree` est rempli sans entrée « 12 », l'annuel n'était pas proposé et reste non proposé ;
  - `tarifsDuree`, les quotas, le prix mensuel et le statut ne sont pas touchés.
  - **Liste des formules à traiter à la main** : Prisma n'affiche pas les messages `NOTICE` de la migration. Après le déploiement, lister les formules sans offre annuelle avec (lecture seule) : `SELECT nom, "prixMensuel", "tarifsDuree" FROM "PlanAbonnement" WHERE "prixAnnuel" IS NULL ORDER BY nom;` puis saisir le tarif dans « Formules et tarification » si une offre annuelle est voulue.

### Souscription et activation

- **Déclaration par l'atelier** (`POST /api/abonnements/souscrire`) : `dureeMois` vaut 1 ou 12 et doit avoir un prix dans le catalogue, sinon 400. Le prix lu à ce moment est **figé** dans l'abonnement et la transaction (devise `XOF`). Modifier le catalogue ensuite ne change ni un paiement en attente, ni un abonnement actif.
- **Un paiement en attente n'active rien** : ni accès, ni quotas, ni fonctionnalités, jusqu'à la confirmation du SUPERADMIN (ou, plus tard, de Wave).
- **Activation manuelle SuperAdmin** (`POST /api/ateliers/:id/abonnement/activer`) : `mode: "CATALOGUE"` (période mensuelle ou annuelle, prix du catalogue) ou `mode: "EXCEPTIONNEL"` (durée ou date d'expiration **et** montant entier saisis, **motif obligatoire**). Prix et durée sont figés ; l'abonnement est marqué `tarifExceptionnel`. Aucun prix n'est déduit.
- **Quotas** : inchangés. Un abonnement annuel est un abonnement de 12 mois ; ses limites sont figées comme celles d'un mensuel.

### Paiements en XOF

- Montants entiers uniquement. **Wave reste inactif** ; avant toute session, le montant doit être un entier strictement positif (sinon refus, sans appel réseau). Sa disponibilité au Niger n'est pas confirmée.
- Paiements manuels : inchangés (déclaration, puis confirmation humaine).
- Aucun prestataire de paiement local n'a d'API publique documentée.

### Suivi par formule

`GET /api/plans-abonnement/:id/abonnes` (SuperAdmin) : ateliers actuellement abonnés, prix figé, période, revenu mensuel récurrent. Les revenus globaux restent dans le tableau commercial.
