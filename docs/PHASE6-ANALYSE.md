# Phase 6 — Analyse de l'existant avant extension fonctionnelle

Constat établi par lecture du code et du schéma le 15 novembre 2026. Rien n'a été modifié.

## 1. Ce qui existe déjà

| Point de la mission | Existant | Écart |
|---|---|---|
| 1. Employés | **Rien.** Trois rôles : `SUPERADMIN`, `ADMIN` (le PDG, et tout autre compte ADMIN que le SUPERADMIN ajoute à l'atelier), `USER` (cliente finale). Aucun compte « employé » | Tout est à créer |
| 2-3. Rôles et permissions | **Rien.** Toutes les routes métier sont réservées au rôle `ADMIN` en bloc (14 routeurs passent par `requireAtelier`) : un compte qui n'est pas ADMIN n'accède à rien | Introduire un rôle employé et un contrôle par permission sur **chaque** routeur |
| 4-5. Attribution et suivi de production | **Partiel.** Une commande a un statut (`NOUVELLE → EN_CONFECTION → ESSAYAGE ⇄ RETOUCHES → TERMINEE → LIVREE`), une priorité et une date de livraison prévue ; une notification `RETARD` existe. **Aucune notion d'affectation** à une personne | Ajouter l'affectation ; réutiliser statut et retard existants |
| 6. Fournisseurs | **Rien** | À créer |
| 7. Achats | **Rien.** Les **dépenses** existent (catégorie libre, montant, justificatif, annulation avec motif) | Un achat de matières est une dépense : éviter la double saisie |
| 8. Approvisionnement | **Partiel.** Le **stock** existe (articles, seuil d'alerte, mouvements `ENTREE`/`SORTIE` avec motif libre, verrou et idempotence). Aucun lien avec un achat ni un fournisseur | Une réception d'achat doit créer des mouvements d'entrée, pas un second mécanisme de stock |
| 9. Notifications | **Partiel.** Notifications d'alerte **par atelier** (retard, prête, livraison proche, impayée), reconstruites à la demande ; courriel quotidien ; notifications **à la cliente** liées à ses commandes. Aucune alerte de stock bas (la liste `/stock/alertes` existe, sans notification), aucune notion de destinataire individuel | Ajouter des destinataires et de nouveaux types |
| 10. Rapports | **Partiel.** Rapports financiers, évolution, commandes (statut, priorité, type), clientes, modèles, en retard, à livrer. **Rien** sur la production, les employés, les achats ou les dépenses par catégorie dans les rapports | Ajouter, sans dupliquer les rapports existants |

## 2. Contraintes qui structurent la conception

1. **Contrôle d'accès actuel binaire.** `requireAtelier` exige `role === "ADMIN"`. Un nouveau rôle ne peut pas s'y glisser sans toucher aux 14 routeurs ; c'est le point de risque principal de la phase.
2. **Données financières dans les mêmes réponses que les données de production.** Une commande renvoie son prix, ses paiements, son solde. Cacher la finance à un couturier suppose de **filtrer les champs des réponses**, pas seulement de fermer des routes.
3. **Isolation entre ateliers** : toute nouvelle table porte un `atelierId` (ou se rattache à une table qui en porte un) et toute lecture le filtre.
4. **Abonnement** : un employé est soumis à la même règle (grâce puis lecture seule) que son atelier.
5. **Idempotence et verrous** : les écritures de stock passent déjà par un verrou ; les réceptions d'achat doivent les réutiliser.
6. **Droits du SUPERADMIN et du PDG préservés** : le PDG garde tous les droits ; le SUPERADMIN garde la gestion de la plateforme et l'impersonation.

## 3. Conception proposée

**Employés et permissions.**
- Nouveau rôle `EMPLOYE`, rattaché à un atelier. Le PDG (compte `ADMIN`) crée, modifie, consulte et **désactive** les employés (un employé désactivé ne peut plus se connecter ; aucun compte n'est supprimé).
- **Postes** = modèles de permissions prêts à l'emploi (par exemple couturier, réceptionniste, magasinier, comptable). Le poste ne fait que **pré-remplir** les permissions ; le PDG les ajuste ensuite employé par employé.
- **Permissions** = liste fixe de droits nommés par module et par action (lire / écrire), plus quelques droits sensibles distincts : voir les montants, gérer les paiements, voir les rapports financiers, gérer les employés, gérer les paramètres. Un employé n'a **que** ce que le PDG lui accorde ; par défaut, rien de financier ni d'administratif.
- Les permissions sont **relues en base à chaque requête** (comme la suspension d'atelier) : retirer un droit ou désactiver un employé prend effet immédiatement.
- Les droits d'administration de l'atelier (employés, paramètres, abonnement, paiements d'abonnement) restent **réservés au PDG** et ne peuvent pas être délégués.

**Affectation et production.** Une commande peut être affectée à un employé (historique des affectations conservé). Un couturier voit **ses** travaux ; le PDG voit tout. Suivi = statut existant + retards (date prévue dépassée) + charge par employé.

**Fournisseurs, achats, approvisionnement.** Fournisseur (coordonnées, notes, historique d'achats). Achat = en-tête (fournisseur, date, statut) + lignes (article de stock ou libellé, quantité commandée, prix). **Réception** (partielle ou totale) = mouvements d'entrée de stock sur les articles concernés, quantités reçues suivies par ligne. Le paiement d'un achat se rattache à la **dépense** existante (pas de second registre financier).

**Notifications.** Extension du mécanisme existant avec un destinataire (le PDG, ou l'employé concerné) : tâche affectée, retard d'un travail, stock sous le seuil, achat attendu non reçu.

**Rapports.** Nouveaux rapports (production par employé, retards, achats par fournisseur, dépenses par catégorie, marges simples) soumis à une permission distincte.

## 4. Décisions à prendre avant de coder

Quatre choix changent l'architecture ou les règles de gestion :

1. Modèle de permissions (par employé et personnalisable, ou rôles fixes seulement).
2. Lien entre achats et dépenses (une seule saisie, ou deux registres).
3. Profondeur du suivi de production (statut existant, ou étapes détaillées par commande).
4. Destinataires et canaux des notifications.

## 5. Plan de réalisation proposé

| Sous-phase | Contenu |
|---|---|
| 6.1 | Employés, postes, permissions ; contrôle d'accès par permission sur les 14 routeurs ; filtrage des champs financiers ; connexion employé ; interface de gestion |
| 6.2 | Affectation des commandes et suivi de production (vue « mes travaux », retards, charge) |
| 6.3 | Fournisseurs |
| 6.4 | Achats et réception → stock (et dépense) |
| 6.5 | Notifications automatiques |
| 6.6 | Rapports avancés |
| 6.7 | Documentation et bilan |

Chaque sous-phase est testée contre les anciens modules (isolation entre ateliers, droits du PDG et du SUPERADMIN, absence de fuite financière vers un employé, interaction avec l'abonnement).

## 6. Limites de cette analyse

- Lecture du code uniquement ; aucune donnée de production n'a été consultée (nombre réel de comptes ADMIN par atelier, usages réels du stock et des dépenses).
- Les noms de postes et la liste exacte des permissions sont une proposition à valider avec les ateliers.

## 7. Décisions du 15/11/2026

Les quatre options recommandées ont été retenues : postes + permissions par employé ; achats liés aux dépenses (une seule saisie) ; production = affectation + statut existant ; notifications dans l'application vers le PDG et l'employé concerné.

Plan ajusté : **6.1** employés et permissions (serveur) · **6.2** interface employés · **6.3** affectation et production · **6.4** fournisseurs · **6.5** achats et réception · **6.6** notifications · **6.7** rapports · **6.8** documentation et bilan.

## 8. Réalisé en 6.1 — employés, postes, permissions (serveur)

**Base de données** (migration additive `20261121090000`) : valeur de rôle `EMPLOYE` ; sur `User` : `actif`, `desactiveLe`, `poste`, `permissions`, `telephone`. Tous les comptes existants sont actifs ; aucune ligne modifiée.

**Contrôle d'accès.** Trois niveaux de middleware : `requireAtelier` (PDG seulement, administration), `requireMembreAtelier` (PDG ou employé, appartenance à un atelier actif) puis `requirePermission` / `droitsParModule` (lecture ou écriture d'un module). Appliqué à **tous** les routeurs métier (clientes, modèles, commandes, paiements, livraisons, reçus, dépenses, stock, demandes, tableau de bord, rapports, notifications). Permissions, rôle et état actif sont relus en base à chaque requête dans la lecture déjà faite par `requireAuth` : aucune requête SQL supplémentaire.

**Aucune fuite financière.** Sans `finances.voir`, un middleware retire des réponses toutes les clés qui portent un montant (prix, payé, solde, paiements, prix des modèles et du stock, dépenses du tableau de bord…) ; l'export des commandes est refusé, l'export du stock perd sa colonne de prix, la fiche PDF n'a plus de bloc de montants, les alertes d'impayé sont masquées. Un acompte ou un paiement final exige en plus `paiements.ecrire`. **Garde-fou** : un test lit `schema.prisma` et échoue si une colonne `Decimal` n'est pas classée financière ou non : impossible d'ajouter un montant sans le décider.

**Validations avant opération sensible.** Attribuer un droit sensible (paiements, dépenses, `finances.voir`) ou réinitialiser le mot de passe d'un employé exige le mot de passe du PDG (10 essais par 15 minutes, indisponible pendant une impersonation). Toute opération est inscrite au journal de sécurité (`EMPLOYE_*`).

**Désactivation** : session coupée immédiatement, connexion refusée, rien supprimé, réversible. L'état « désactivé » coupe une session à lui seul, indépendamment de la version de session.

**Tests.** 18 + 9 unitaires (catalogue, implications, masquage, garde-fou du schéma) et 35 d'intégration (isolation entre ateliers, matrice « aucune permission = aucun accès » sur 27 routes, couturier / réceptionniste / comptable, effet immédiat, interaction avec l'abonnement et la suspension, impersonation, traçabilité). Mutations détectées : masquage retiré, administration ouverte aux employés, état désactivé ignoré, permissions ignorées, confirmation sensible ignorée. Les 268 tests d'intégration existants passent sans modification : le comportement du PDG est inchangé.

**Limites actuelles :**
- **Pas encore d'interface** : un employé qui se connecte verrait l'interface du PDG avec des erreurs 403. L'interface (gestion des employés, navigation et pages adaptées aux permissions) est l'objet de la 6.2 ; **ne pas déployer la 6.1 seule** si des employés peuvent être créés.
- Les notifications restent à l'état « lu » partagé : un employé les lit mais ne peut pas les modifier (à lever en 6.6).
- Pas de limite du nombre d'employés par formule (les limites de formule ne sont pas appliquées).
- Pas d'obligation de changer le mot de passe à la première connexion.
- Le catalogue de permissions et les postes sont une proposition à valider avec des ateliers réels.

## 9. Réalisé en 6.2 — interface employés et permissions

- **Gestion par le PDG** (`/employes`, `/employes/nouveau`, `/employes/:id`) : liste filtrable (actifs / désactivés / tous) et recherchable ; formulaire d'identité, choix du poste (ses droits servent de point de départ à la création ; en modification, un bouton explicite les réapplique), cases de permissions regroupées par module avec badge « sensible » ; la case « lire » est verrouillée tant que « écrire » est cochée ; ajouter un droit sensible fait apparaître la confirmation par mot de passe ; désactivation en deux étapes, réactivation, réinitialisation du mot de passe.
- **Côté employé** : navigation filtrée sur ses permissions (`filtrerNavigation`), pages protégées par `RequirePermission` (redirection vers son premier écran autorisé, « Mon compte » au pire), pages existantes rendues tolérantes à l'absence des montants (champs financiers masqués par le serveur).
- **Bug trouvé par l'E2E** : la réponse de `POST /api/auth/login` ne contenait pas `poste`/`permissions` → l'employé voyait une interface vide jusqu'au rechargement. Corrigé côté serveur.
- **Tests** : 14 unitaires frontend sur les helpers (dont dérive par rapport au catalogue serveur), 4 E2E (`e2e/specs/employes.spec.js`) : création par l'interface, confirmation du droit sensible, session employé (navigation limitée, pages interdites redirigées, aucun écran d'erreur), désactivation puis connexion refusée. Suite E2E complète : 39 verts.
- **Limites** : champs de prix des formulaires modèle/stock et liste des modèles non masqués pour un employé sans `finances.voir` (le serveur ne renvoie pas les montants, donc pas de fuite, mais l'affichage peut être vide) ; interface mobile et anglais non vérifiés visuellement ; le catalogue des postes reste une proposition à valider avec de vrais ateliers.

## 10. Réalisé en 6.3 — affectation des commandes et suivi de production

**Fonctionnement**
- Une commande ouverte (ni livrée ni annulée) peut être confiée à **une** personne : un employé actif de l'atelier ou le PDG. Fiche commande → section « Affectation » (choisir, affecter, retirer). Le statut de la commande reste la seule représentation de l'avancement (décision du 15/11) : l'affectation dit *qui*, le statut dit *où en est le travail*.
- **Historique** : chaque affectation, réaffectation ou retrait ajoute une ligne (qui, à qui, quand), jamais modifiée. Répéter la même affectation ne change rien.
- **Retard** : commande ouverte dont la date de livraison prévue est antérieure au jour courant (le jour même n'est pas un retard). Pastille « En retard » dans la liste et sur la fiche.
- **« Mes travaux »** : filtre `assigneA=moi` de la liste des commandes (accessible à tout employé qui peut lire les commandes) ; autres filtres : `aucun` (non affectées), un employé précis, `enRetard=true`.
- **Page Production** (`/production`) : commandes en cours, en retard, non affectées, charge par personne avec lien vers ses travaux. Aucun montant.
- **Désactivation d'un employé** : ses commandes ouvertes redeviennent non affectées, avec trace dans l'historique, dans la même transaction.

**Nouvelle permission** : `commandes.affecter` (non sensible, implique `commandes.lire`), absente de tous les postes par défaut (le PDG l'accorde au cas par cas). Total : 22 permissions. L'affectation ne donne aucun droit supplémentaire à l'employé concerné (testé).

**Base de données** (migration additive `20261122090000_affectation_commandes`) : colonnes `Commande.assigneAId` (FK `User`, `SET NULL`) et `Commande.assigneLe` ; table `AffectationCommande` (historique) ; index `(atelierId, assigneAId, statut)`. Retour arrière : supprimer la table, les deux colonnes et l'index (aucune donnée existante n'est modifiée).

**API** : `PUT /api/commandes/:id/affectation`, `GET /api/commandes/production`, filtres et champs `assigneA`, `enRetard`, `affectations` ajoutés aux routes existantes (167 routes documentées).

**Tests** : 15 d'intégration (droits, historique, idempotence, commande livrée, autre atelier, compte désactivé, retards, charge, absence de montant, désactivation), 4 unitaires backend, 1 test de dérive frontend, 3 E2E (affectation par le PDG, « Mes travaux » du couturier sans montant ni écran de production). Suites complètes : 333 unitaires backend, 318 intégration, 95 frontend, 42 E2E.

**Limites**
- Un employé qui peut changer le statut (`commandes.statut`) le peut sur **toute** commande, pas seulement les siennes : l'affectation organise, elle ne restreint pas. À durcir si des ateliers le demandent.
- Pas de notification à l'employé lors d'une affectation ni d'un retard : prévu en 6.6.
- Le retard se calcule en UTC (jour du serveur) ; pas de rapport de production par employé avant la 6.7.
- Pas d'étapes de production détaillées par commande (décision du 15/11).

## 11. Réalisé en 6.4 — fournisseurs

**Fonctionnement** : un annuaire des fournisseurs de l'atelier (nom, personne à contacter, téléphone, email, adresse, notes) avec recherche, archivage et restauration. Un fournisseur n'est jamais supprimé : les achats de la 6.5 s'y référeront. Le nom est unique par atelier, sans tenir compte de la casse ni des espaces multiples, archivés compris (le message indique si le doublon est archivé) ; la vérification se fait sous verrou, donc des créations simultanées ne produisent qu'une seule fiche (testé avec 6 requêtes parallèles). Un fournisseur archivé ne se modifie pas.

**Permissions** : `fournisseurs.lire` et `fournisseurs.ecrire` (non sensibles, aucune donnée financière), 24 permissions au total. Le poste « Magasinier » les reçoit au départ ; les employés existants ne sont pas modifiés (un poste ne réécrit jamais des droits déjà accordés).

**Base de données** (migration additive `20261123090000_fournisseurs`) : table `Fournisseur` et un index. Retour arrière : supprimer la table.

**API** : 6 routes (`/api/fournisseurs`, voir `docs/API.md` §9 bis ; 173 routes documentées). **Interface** : `/fournisseurs` (liste, fiche, création, modification), entrée « Fournisseurs » dans la navigation filtrée par permission.

**Tests** : 8 d'intégration (CRUD, unicité et casse, concurrence, validation, archivage, isolation entre ateliers, droits lecture/écriture/aucun), 4 E2E (création, doublon refusé avec message, magasinier créé par le PDG qui voit la page sans accès aux finances, archivage). Suites complètes : 333 unitaires backend, 326 intégration, 95 frontend, 46 E2E.

**Test E2E et limiteur de connexion** : les sessions des employés créés pendant les tests sont ouvertes par l'API directement (`e2e/session.js`, IP de test distincte) au lieu du formulaire : le limiteur (10 tentatives / 15 min / IP) est conservé tel quel et les nouveaux parcours le saturaient. La connexion par l'interface reste testée (`auth.spec.js`, `employes.spec.js`).

**Limites** : pas encore de lien article de stock ↔ fournisseur habituel (la 6.5 rattachera les achats aux fournisseurs et aux articles) ; un champ facultatif ne peut pas être vidé après coup (même comportement que les modèles : une valeur vide est ignorée) ; pas d'import de fournisseurs.

## 12. Réalisé en 6.5 — achats, réception en stock, paiement en dépense

**Fonctionnement** (décision du 15/11 : une seule saisie, l'argent suit les dépenses, la marchandise suit le stock)
- **Achat** : bon de commande à un fournisseur (numéro `ACH-AAAA-NNNN`), 1 à 50 lignes (article, quantité, prix unitaire), date de livraison attendue facultative, notes. Total plafonné à celui d'une dépense (10 000 000). Fournisseur ou article archivé refusé.
- **Réception** (totale ou partielle, autant de fois que nécessaire) : chaque quantité reçue crée **une entrée de stock** (`MouvementStock` ENTREE, motif « Réception achat … », reliée à la ligne) dans la même transaction que la mise à jour de la ligne. Recevoir plus que le reste à recevoir est refusé (409) ; une réception multi-lignes est tout ou rien.
- **Paiement** : crée **une dépense** « Achats fournisseurs » du montant total, liée à l'achat. Si cette dépense est annulée plus tard dans le module Dépenses, l'achat redevient « non payé » et peut être payé de nouveau (l'état de paiement est lu sur la dépense, jamais stocké). Pas de double paiement.
- **Annulation** (motif obligatoire) : seulement si rien n'est reçu et rien n'est payé. Une marchandise reçue se corrige par un mouvement de stock ; un achat payé s'annule en annulant d'abord la dépense. Les achats ne sont jamais supprimés.
- Les états de **réception** (aucune, partielle, complète), de **paiement** et le **total** sont toujours calculés (lignes, dépense liée), jamais stockés.

**Permissions** : `achats.lire` (consulter), `achats.recevoir` (réceptionner), `achats.ecrire` (créer, modifier, annuler, payer). Total : 27 permissions. Sans `finances.voir`, les prix, le total, le statut de paiement et la dépense liée sont retirés de toutes les réponses : un magasinier réceptionne sans voir un prix (testé, y compris par mutation). `achats.ecrire` est **sensible** (confirmation par mot de passe du PDG) et implique `finances.voir` et `achats.recevoir` ; payer exige en plus `depenses.ecrire`. Postes : « Magasinier » reçoit `achats.recevoir`, « Comptable » reçoit `achats.lire`.

**Base de données** (migration additive `20261124090000_achats`) : tables `Achat` et `LigneAchat`, colonne `MouvementStock.ligneAchatId`, et un `CHECK` en base (`0 ≤ quantiteRecue ≤ quantite`, prix ≥ 0) qui garantit l'invariant même en écriture directe. Retour arrière : supprimer les deux tables, la colonne et la contrainte (aucune donnée existante n'est modifiée).

**Sécurité des données** : le verrou de ligne sur l'achat sérialise réceptions, paiements et annulations (testé avec des requêtes parallèles : 2 réceptions de 4 sur 10 acceptées sur 6 tentatives, une seule dépense sur 5 paiements simultanés) ; clés d'idempotence acceptées à la création, à la réception et au paiement. Le garde-fou `masquageFinances` classe la nouvelle colonne décimale `LigneAchat.prixUnitaire` comme financière.

**API** : 8 routes (`/api/achats` dont `/options` pour le formulaire), `docs/API.md` §9 ter ; 181 routes documentées. **Interface** : `/achats` (liste avec vues « à recevoir », « reçus », « annulés »), `/achats/nouveau` (lignes dynamiques, total en direct), fiche avec formulaire de réception (« Tout recevoir »), paiement en deux étapes et annulation avec motif.

**Tests** : 22 d'intégration (création et refus, idempotence, réception partielle/complète, atomicité, concurrence, CHECK en base, paiement, dépense annulée puis repayée, annulation, filtres, isolation, droits et masquage) ; 4 mutations détectées (verrou du paiement, verrou de réception, masquage des prix, prise en compte de l'annulation de la dépense) ; 2 unitaires frontend (calcul du total) ; 6 E2E (création avec total en direct, réception partielle puis stock vérifié, dépassement refusé, magasinier sans aucun prix, paiement puis dépense vérifiée, annulation refusée). Suites complètes : 333 unitaires backend, 348 intégration, 97 frontend, 52 E2E.

**Limites**
- Un seul paiement du total (pas d'acompte ni de paiements échelonnés) ; plusieurs paiements demanderaient un registre de paiements d'achat distinct.
- Les lignes et les prix ne se modifient pas après création : annuler et recréer (tant que rien n'est reçu ni payé). L'API permet de modifier la date attendue et les notes ; l'interface ne l'expose pas encore.
- Recevoir ne modifie pas le prix unitaire de l'article de stock (comportement existant inchangé) ; pas de gestion de retours fournisseur.
- Pas de rappel « achat attendu non reçu » avant la 6.6 ; pas de rapport par fournisseur avant la 6.7.

## 13. Réalisé en 6.6 — notifications automatiques

**Nouvelles alertes** (dans l'application, décision du 15/11 ; toujours **dérivées de l'état réel** et recalculées à la lecture, comme les alertes de la phase 4 : aucun texte stocké, elles disparaissent seules quand la cause disparaît) :

| Alerte | Quand | Qui la voit |
|---|---|---|
| `TACHE_AFFECTEE` | une commande ouverte est confiée à un employé actif | cet employé seul (ni le PDG, ni un collègue) |
| `RETARD` (existante) | commande en retard | le PDG ; l'employé à qui la commande est confiée ; qui gère les commandes (`commandes.ecrire` ou `commandes.affecter`) |
| `PRET`, `LIVRAISON_PROCHE` (existantes) | commande prête / livraison proche | idem `RETARD` |
| `STOCK_BAS` | quantité de l'article ≤ seuil d'alerte (seuil renseigné, article non archivé) | le PDG et qui gère le stock (`stock.ecrire`) ; la quantité actuelle est affichée |
| `ACHAT_EN_RETARD` | achat non annulé, pas entièrement reçu, date attendue passée | le PDG et qui réceptionne (`achats.recevoir`) |
| `IMPAYE` (existante) | commande sans paiement | le PDG et `finances.voir`, inchangé |

Réaffecter une commande déplace l'alerte vers le nouvel employé (non lue) ; la retirer, annuler ou livrer la commande, désactiver le compte, réapprovisionner ou réceptionner la fait disparaître.

**État de lecture individuel** (lève la limite notée en 6.1) : un employé marque lu **pour lui seul** (table `NotificationLue`) ; le drapeau historique `Notification.lu` reste celui du PDG (et de l'espace client pour `PRET` / `LIVRAISON_PROCHE`, comportement inchangé). Un employé ne modifie donc jamais l'état du PDG ni celui d'un collègue, ne peut pas atteindre une notification hors de sa vue (404) et ne peut pas supprimer (réservé au PDG). Changement de comportement par rapport à la 6.1 : un employé sans gestion des commandes ne voit plus les alertes des commandes qui ne lui sont pas confiées.

**Résumé quotidien par email** : reste réservé au PDG, désormais **explicitement**. Il était envoyé à tout compte de l'atelier ayant une adresse email — donc aussi à un employé, avec le décompte des impayées. Corrigé (filtre `lib/rappelsQuotidiens.js`, testé par mutation) ; le résumé compte aussi stock bas et achats en retard et ignore les alertes individuelles.

**Base de données** (migration `20261125090000_notifications_employes`, additive sauf `commandeId` rendu facultatif) : `Notification` reçoit `atelierId` (rempli depuis la commande pour les lignes existantes — vérifié sur une base contenant déjà une notification), `articleId`, `achatId`, `destinataireId` ; trois valeurs d'énumération ; table `NotificationLue` ; un `CHECK` impose exactement **une** référence (commande, article ou achat). Retour arrière : supprimer les alertes non liées à une commande, remettre `commandeId` obligatoire, supprimer les colonnes et la table.

**Interface** : la page Notifications affiche les nouveaux types (icône, libellé, lien vers la commande, l'article ou l'achat) ; un employé peut marquer lu, la suppression n'est proposée qu'au PDG.

**Tests** : 16 d'intégration (travail confié et réaffectation en une seule lecture, retards, droits par type, stock bas au seuil exact, achats en retard, lecture individuelle, isolation, résumé quotidien) avec 5 mutations détectées (vue limitée aux commandes confiées, drapeau partagé modifié par un employé, destinataires du résumé, ordre suppression/création, seuil strict) ; 3 E2E ; la suite d'intégration existante passe inchangée sauf un test de la 6.1 mis à jour (la limite « un employé ne peut pas marquer lu » est levée). Suites complètes : 333 unitaires backend, 364 intégration, 97 frontend, 55 E2E.

**Limites** : alertes recalculées à la lecture (pastille actualisée toutes les 60 s), pas de notification poussée ni d'email individuel à l'employé ; pas de réglage par personne de ce qu'elle veut recevoir ; l'alerte de retard utilise la définition historique (statut non terminé et date dépassée), légèrement différente du filtre « en retard » de la page Production (qui garde `TERMINEE` en cours jusqu'à la livraison) — à harmoniser si besoin.

## 14. Réalisé en 6.7 — rapports avancés

**Permission distincte** : `rapports.avances` (non sensible, implique `rapports.lire`). Voir la performance des employés n'est pas anodin : le PDG l'accorde employé par employé. Les rapports qui portent un **montant** exigent **en plus** `finances.voir`, comme les rapports financiers existants. Aucun poste ne la reçoit par défaut.

**Cinq rapports** (`GET /api/rapports/avances/…`, consultatifs, bornés à l'atelier, période `?period=|from=&to=`) :
| Rapport | Contenu | Droit |
|---|---|---|
| `production` | par employé : commandes ouvertes, en retard, livraisons de la période, part livrée à l'heure ; commandes ouvertes non affectées | `rapports.avances` |
| `retards` | retards du jour (par statut, par priorité, 20 plus anciens) ; ponctualité des livraisons de la période (taux, retard moyen) | `rapports.avances` |
| `achats-fournisseurs` | par fournisseur : achats, annulés, valeur commandée / reçue / payée, reste à payer | + `finances.voir` |
| `depenses-categories` | dépenses non annulées par catégorie : nombre, total, part, dont achats fournisseurs | + `finances.voir` |
| `marges` | marge simple = valeur des commandes (hors annulées) − dépenses ; taux ; solde de caisse ; valeur par type de vêtement | + `finances.voir` |

**Définitions (à lire avant d'interpréter un chiffre)**
- **Retard** : la définition de la production (6.3) : ouverte et date de livraison prévue **avant le début du jour UTC**. Le rapport « en retard » plus ancien (`/rapports/commandes/en-retard`) compare à l'instant exact : il peut afficher une commande de plus le jour même ; non modifié pour ne pas changer un comportement existant.
- **À l'heure** : livrée au plus tard le jour prévu (comparaison de dates, pas d'heures). Livraisons annulées exclues.
- **Attribution à l'employé** : l'employé **actuellement** chargé de la commande ; l'historique des affectations n'est pas rejoué. Une commande réaffectée après livraison est comptée pour le nouvel employé.
- **Période** : sans effet sur les commandes ouvertes (instantané du jour) ; elle borne les livraisons, achats (date de commande), dépenses et commandes (date de commande).
- **Marge simple** : un **ordre de grandeur**, pas une marge comptable. Aucune dépense n'est rattachée à une commande (loyer, salaires, tissu acheté d'avance) et une commande peut être encaissée sur une autre période. Aucun coût de revient par commande n'existe dans le modèle de données : une marge par commande ou par modèle n'est **pas calculable honnêtement** et n'est pas proposée.
- Les dépenses d'un achat payé figurent dans les dépenses par catégorie (colonne « dont achats ») : décomposition, jamais un double comptage.

**Interface** : page `/rapports/avances` (lien depuis « Rapports » pour qui a la permission) ; les trois sections chiffrées n'apparaissent et ne sont demandées qu'avec `finances.voir`. Libellés FR/EN, libellé de permission dans la fiche employé.

**Tests** : 19 d'intégration avec des chiffres exacts sur un jeu connu (employés, commandes annulées/non affectées/livrées à l'heure et en retard, 2 fournisseurs et un achat annulé, dépenses annulées, un autre atelier avec ses propres données) ; permissions (`rapports.lire` seul → 403 sur les cinq ; sans `finances.voir` → 403 sur les trois chiffrés ; production et retards sans aucun montant) ; périodes vides (pas de division par zéro) ; 3 E2E (PDG, employé sans la permission, employé avec la permission sans les montants) ; garde de dérive des permissions frontend/serveur. **8 mutations**, 6 détectées d'emblée, 2 non détectables de l'extérieur (filtres d'atelier redondants : le rapport est déjà isolé par la jointure sur l'employé / le fournisseur, ces filtres sont une seconde barrière).

**Performance** (gros volume, base locale) : production 9 ms, retards 30 ms, marges 35 ms, dépenses 8 ms, achats 7 ms (le jeu de volume ne contient pas d'achats : à relever sur de vraies données).

**Limites**
- Pas d'export CSV de ces rapports, ni de graphique : tableaux et chiffres seulement.
- Pas de comparaison avec la période précédente (existe pour les finances, pas ici).
- Le garde-fou de l'interface (page, lien) n'est pas ce qui protège : seul le serveur l'est (403 testé). Le test E2E de la page vérifie l'affichage, pas la sécurité.
- Les montants s'affichent comme dans les rapports existants (sans symbole de devise).

## 15. Réalisé en 6.8 — documentation et bilan

Le bilan complet de la phase est dans **BILAN-PHASE6.md** (état des 10 points, consignes, changements de comportement, risques, travaux restants). Remarque sur le plan : la table du §5 est celle de l'analyse initiale ; le plan **ajusté** réellement suivi est : 6.1 employés (serveur), 6.2 interface employés, 6.3 affectation et production, 6.4 fournisseurs, 6.5 achats, 6.6 notifications, 6.7 rapports avancés, 6.8 documentation et bilan. `DOCUMENTATION.md` (écrit avant les phases 4 à 7) porte maintenant un avertissement renvoyant aux bilans.
