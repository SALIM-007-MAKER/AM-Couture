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
