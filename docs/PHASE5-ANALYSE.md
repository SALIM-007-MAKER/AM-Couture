# Phase 5 — Analyse du système d'abonnement existant

Constat établi par lecture du code et du schéma le 15 novembre 2026, avant tout développement. Rien n'a été modifié.

## 1. Ce qui existe

| Élément | État | Où |
|---|---|---|
| Essai de 15 jours | **Fonctionne** : `Atelier.trialEndsAt = inscription + 15 j`, évalué à chaque requête (aucune tâche planifiée nécessaire). Ateliers antérieurs (`trialEndsAt` null) : jamais bloqués | `lib/atelierProvisioning.js`, `lib/trial.js` |
| Plans | **Fonctionne** : `PlanAbonnement` (prix mensuel, fonctionnalités en texte libre, remises par durée), gérés par le SUPERADMIN. Prix figé à l'activation (`Abonnement.prix`) | `lib/abonnement.js`, `plans.routes.js` |
| Activation | **Manuelle uniquement** par le SUPERADMIN, idempotente, avec historique (`HistoriqueAbonnement`) | `ateliersAbonnement.routes.js` |
| États | `ACTIF`, `EN_ATTENTE`, `ESSAI`, `EXPIRE`, `AUCUN`, **dérivés** des dates (jamais stockés) : pas de dérive possible | `etatAbonnementAtelier` |
| Blocage | Essai terminé sans abonnement actif → **402 sur toutes les routes métier**, lecture comprise. Contournement en impersonation | `requireAbonnementActif` |
| Souscription par l'atelier | **N'existe pas** : `GET /api/abonnements/etat` est la seule route côté atelier, en lecture seule | `abonnements.routes.js` |
| Paiement en ligne | Code **dormant et non monté** : client Wave (`lib/wave.js`), 3 fournisseurs (`lib/payments/`), route de webhook. Aucune route ne crée de `Transaction` | `webhooks.routes.js` (non montée) |
| Tests | Essai/blocage et activation manuelle couverts (intégration). **Webhook, signature Wave et fournisseurs : aucun test** | |

## 2. Écarts avec le brief

| # | Brief | Écart constaté |
|---|---|---|
| 1 | Formules avec **limites** | Aucune limite chiffrée (clientes, commandes, comptes) : seule une liste de fonctionnalités en texte libre, non appliquée par le code |
| 3 | Souscription par l'atelier | Absente (voir ci-dessus) |
| 4 | Cycle de vie : **suspendus**, **renouvelés** | Pas d'état « suspendu » pour un abonnement (la suspension existe au niveau de l'atelier). Renouvellement : `activerAbonnement` repart de « maintenant » — **renouveler un abonnement encore actif ferait perdre les jours restants** |
| 5-6 | Paiement, vérification serveur | Rien d'actif. Dans le code dormant : relecture authentifiée chez Wave + contrôle référence/montant (bon principe) |
| 7 | Webhooks | Voir §3 : plusieurs écarts avec la documentation Wave |
| 8 | Factures | **Absentes** (pas de modèle, pas de PDF d'abonnement) |
| 9 | Rappels avant expiration | **Absents** (le cron ne traite que les rappels de commandes) |
| 10 | Impayés | Aucune règle : pas de délai de grâce, pas de relance |
| 11 | Limitation des accès | Blocage total, y compris la **lecture et l'export des données de l'atelier** : un atelier dont l'abonnement échoit ne peut plus récupérer ses propres clientes ni commandes |
| 12 | Tableau de bord SUPERADMIN | Existe en partie (liste des ateliers, état d'abonnement, tendances sur 6 mois). **Pas de revenus par plan, pas de vue des renouvellements à venir ni des transactions** |
| — | Remboursements, annulations | Rien (statuts `ANNULEE`/`EXPIREE` de transaction existent mais aucun flux) |

## 3. Écarts du code Wave avec la documentation officielle

Lue le 15/11/2026 sur docs.wave.com (pages Checkout et Webhooks).

| Sujet | Documentation Wave | Code actuel |
|---|---|---|
| Signature des webhooks | `Wave-Signature: t=…,v1=…`, HMAC-SHA256 de `t` + corps brut, tolérance 5 min, plusieurs `v1` pendant une rotation | **Conforme** |
| Identifiant d'événement | `id` unique par événement ; Wave peut **dupliquer, retarder ou désordonner** les événements | Non mémorisé : l'idempotence repose sur le statut de la transaction, **sans verrou** → deux webhooks simultanés peuvent passer tous deux le contrôle |
| Événements | `checkout.session.completed`, `checkout.session.payment_failed` | Seul `completed` est traité ; l'échec de paiement est ignoré |
| Expiration | Une session expire après 30 min **sans événement** `expired` | Une transaction restée `EN_ATTENTE` n'est jamais clôturée : il faut un rattrapage périodique qui relit la session |
| Délai de réponse | Réponse attendue en moins de 5 s, traitement asynchrone recommandé | La relecture chez Wave est faite avant de répondre |
| Remboursement | `POST /v1/checkout/sessions/:id/refund` existe | Non utilisé |
| Bac à sable | Non documenté ; exemples en clés de production | Pas de test possible contre l'API réelle sans compte |

## 4. Faisabilité des prestataires

| Prestataire | Constat | Fiabilité de la source |
|---|---|---|
| Wave (Business API, Checkout) | API documentée, authentifiée par clé liée à un compte Wave Business. **Disponibilité au Niger non confirmée** : une page partenaire tierce cite le Niger parmi dix pays, la fiche officielle de l'application cite six autres pays. Compte Business et vérification (KYC) nécessaires, délais annoncés par des sources commerciales : 3 à 10 jours ouvrés | Documentation Wave : fiable ; liste des pays : **non vérifiée** |
| NITA, Amana | **Aucune API publique trouvée.** Fonctionnement manuel : l'atelier paie hors plateforme, le SUPERADMIN confirme | Absence de résultat, pas preuve d'absence |
| Airtel Money, Moov, Orange Money (Niger) | Opérateurs dominants à Niamey d'après des blogs d'intégrateurs ; aucune documentation d'API officielle trouvée ; agrégateurs possibles | Sources commerciales : indicatives |

**Conclusion** : je ne peux pas garantir qu'un paiement en ligne soit utilisable au Niger. Avant d'écrire du code qui en dépend, il faut que **vous** obteniez la confirmation de Wave (pays, compte Business, frais). Le reste du système (souscription, cycle de vie, factures, rappels, tableau de bord) ne dépend pas de ce point et peut être construit autour d'un paiement **manuel vérifié** (déclaration de l'atelier, confirmation tracée du SUPERADMIN), avec Wave branchable ensuite.

## 5. Limites de cette analyse

- Les pages de documentation Wave ont été lues par un outil de lecture automatique ; les noms de champs ci-dessus sont à reconfirmer à l'implémentation.
- Aucune API de prestataire n'a été appelée.
- Les tarifs en base sont des valeurs temporaires de migration ; je n'ai pas lu les valeurs réelles de la base de production.

## 6. Décisions du 15/11/2026 et plan

| Décision | Choix |
|---|---|
| Paiement | **Manuel vérifié d'abord** : l'atelier déclare son paiement, le SUPERADMIN confirme, tout est tracé. Wave est préparé (conformité à la documentation, rattrapage, remboursement) mais **inactif** tant que Wave Business n'est pas confirmé au Niger |
| Après l'échéance | **Grâce puis lecture seule** : accès complet pendant `joursGrace` jours (7 par défaut, réglable 0 à 90 par le SUPERADMIN) avec bandeau, puis consultation et export seulement. Rien n'est supprimé. Abonnement suspendu : lecture seule immédiate |
| Limites par formule | Structure prévue (`PlanAbonnement.limites`, vide), **non appliquée** |

| Sous-phase | Contenu |
|---|---|
| 5.1 | Modèle de données (transactions manuelles, factures, abonnement suspendu, jours de grâce), état d'accès, renouvellement sans perte de jours |
| 5.2 | Souscription par l'atelier, déclaration de paiement, confirmation / rejet / remboursement par le SUPERADMIN, facture PDF |
| 5.3 | Application de la lecture seule (écritures refusées, lectures et exports conservés) |
| 5.4 | Rappels avant expiration et fin d'essai (courriel, une seule fois par échéance) |
| 5.5 | Wave durci (inactif par défaut) : événements dédoublonnés, verrou, échec de paiement, rattrapage des sessions expirées, remboursement ; testé contre un faux serveur Wave |
| 5.6 | Tableau de bord SUPERADMIN : revenus, renouvellements à venir, transactions |
| 5.7 | Interface : page Abonnement de l'atelier, écrans de confirmation du SUPERADMIN |
| 5.8 | Documentation et bilan |

## 7. Réalisé en 5.1

- Migration `20261117090000_abonnement_paiements_factures` : **additive**, rejouée sur une base contenant déjà un abonnement et une transaction (lignes inchangées, `atelierId` de la transaction déduit de son abonnement). Une seule transaction en attente par abonnement (index unique partiel) ; contraintes `CHECK` en `NOT VALID`.
- `lib/abonnement.js` : état `SUSPENDU`, `modeAcces()` (complet, grâce, lecture seule), `dateDebutSouscription()` (un renouvellement anticipé commence à l'échéance en cours, aucun jour perdu).
- 23 tests unitaires (`lib/__tests__/abonnement.test.js`), deux mutations détectées.

## 8. Réalisé en 5.2 — souscription et paiements manuels vérifiés

**Flux.** L'atelier choisit une formule et une durée proposées, puis déclare un paiement fait hors plateforme (opérateur, référence, note) : `POST /api/abonnements/souscrire`. Rien n'est activé. Le SUPERADMIN rapproche la référence de son relevé puis confirme, rejette ou rembourse (`/api/plateforme/transactions/:id/...`). La confirmation active l'abonnement et émet la facture.

**Garanties (toutes testées en intégration, 22 tests, mutations détectées) :**
- le prix vient du serveur ; un champ `montant` envoyé est refusé ; la durée doit être proposée par la formule ;
- une déclaration n'accorde aucun accès ; un moyen `WAVE` ne peut pas être déclaré ni confirmé à la main ;
- une seule déclaration en attente par atelier (règle applicative et index unique partiel) ;
- confirmations répétées ou simultanées (5 en parallèle) : une seule activation, une seule facture, une seule entrée d'historique ; sans les verrous, le test échoue ;
- renouvellement anticipé : le nouvel abonnement commence à l'échéance de celui en cours ;
- rejet, annulation par l'atelier, remboursement : jamais de suppression, tout est daté, signé (`confirmePar`, `rembourseePar`), motivé, historisé et inscrit au journal de sécurité ;
- isolation : un autre atelier reçoit 404 sur une transaction ou une facture qui n'est pas la sienne ;
- suspension / réactivation d'un abonnement avec motif obligatoire ; suspendu = lecture seule immédiate.

**Limites connues, à connaître avant usage :**
- le rapprochement avec le relevé est **humain** : la plateforme ne vérifie aucun paiement auprès d'un opérateur (aucune API disponible) ; sa fiabilité repose sur le SUPERADMIN ;
- le remboursement est **enregistré**, pas exécuté : l'argent est rendu hors plateforme ; remboursement total uniquement ;
- le document émis s'intitule « Justificatif de paiement d'abonnement » et ne porte **aucune mention légale** (identifiant fiscal, registre de commerce, adresse du siège) : elles sont à renseigner dans `lib/facturePdf.js` (`EMETTEUR`) avant tout usage comptable ; je ne les connais pas et ne les ai pas inventées ;
- rembourser un abonnement suivi d'un abonnement planifié laisse un trou entre les deux : les dates ne sont pas recalculées ;
- pas encore de courriel envoyé à l'atelier lors d'une confirmation ou d'un rejet (prévu avec les rappels, 5.4) ;
- la lecture seule n'est pas encore appliquée : `acces.mode` est calculé et exposé, mais le blocage reste l'ancien 402 jusqu'à la 5.3.

## 9. Réalisé en 5.3 — grâce puis lecture seule

**Règle appliquée par `requireAbonnementActif`** (toutes les routes métier de l'atelier) :

| Situation | Accès |
|---|---|
| Essai en cours, atelier ancien sans échéance d'essai | complet, sans requête supplémentaire |
| Abonnement actif | complet |
| Fin d'essai ou d'abonnement depuis moins de `joursGrace` jours (7 par défaut, réglable) | **complet** (l'interface affichera un avertissement, 5.7) |
| Au-delà de la grâce, ou abonnement suspendu | **lecture seule** : `GET` (consultation, exports CSV, PDF) accepté ; toute écriture refusée en **402** avec `details.lectureSeule: true` |
| Impersonation SUPERADMIN | jamais restreint |

**Ce qui reste possible en lecture seule** : consulter et exporter toutes les données ; l'état « lu » des notifications ; le compte (langue, mot de passe) ; la page Abonnement, la souscription et le téléchargement des factures. **Aucune donnée n'est supprimée ni masquée.**

**Changements de comportement par rapport à avant (volontaires) :** un atelier dont l'essai a expiré recevait 402 sur toute requête, lecture comprise ; il peut désormais lire et exporter. Les tests qui attendaient ce blocage total ont été modifiés en conséquence (`trial-abonnement`, `abonnement-manuel`). Un abonnement suspendu pendant un essai encore en cours ne restreint pas l'accès (l'essai prime). Les ateliers sans échéance d'essai (antérieurs à la fonctionnalité) ne sont jamais restreints, même avec un ancien abonnement échu : comportement d'avant conservé.

**Tests** : 10 tests d'intégration (`lecture-seule.test.js`) : grâce, matrice de 13 écritures refusées sans aucun effet en base, 21 lectures et exports acceptés, durée de grâce lue dans les réglages, rétablissement immédiat après confirmation d'un paiement. Trois mutations détectées (écritures autorisées, grâce ignorée, lectures bloquées). Côté interface, un 402 « lecture seule » n'ouvre plus la redirection vers la page Abonnement : le message du serveur s'affiche à l'endroit de la saisie (2 tests).

**Limites :**
- l'interface n'affiche pas encore de bandeau « lecture seule » ni ne désactive les boutons d'écriture (5.7) : l'utilisateur voit le message d'erreur du serveur quand il tente d'écrire ;
- la ligne `joursGrace` est globale à la plateforme (pas de durée par atelier) ;
- `GET /api/notifications` réconcilie des alertes calculées en base même en lecture seule (données dérivées, pas des données métier) ;
- la relecture de l'état d'abonnement après la fin d'essai coûte deux requêtes de plus par requête authentifiée (abonnements et réglages), uniquement pour les ateliers dans cette situation.

## 10. Réalisé en 5.4 — rappels et courriels

**Tâche quotidienne** (`/api/cron/rappels-quotidiens`, 07 h UTC). Pour chaque atelier actif ayant un administrateur avec adresse :

| Situation | Rappel (une seule fois par échéance) |
|---|---|
| Essai : 3 jours ou moins / 1 jour ou moins avant la fin | `ESSAI_J3`, `ESSAI_J1` |
| Abonnement actif : 7, 3, 1 jours avant la fin **de la chaîne de renouvellements** | `ABO_J7`, `ABO_J3`, `ABO_J1` |
| Essai ou abonnement terminé depuis moins de (grâce + 3) jours | `ESSAI_FIN`, `ABO_FIN` : annonce la date de fin de grâce, la lecture seule, et que rien n'est supprimé |

Aucun rappel : atelier suspendu, abonnement suspendu, paiement déjà déclaré et en attente de vérification, atelier antérieur à l'essai gratuit, atelier sans adresse. Les échéances terminées depuis longtemps ne déclenchent rien : **au premier déploiement, aucun atelier abandonné ne reçoit de courriel**.

**Garanties (testées).** La table `RappelAbonnement` (unique par atelier, type et échéance) est réservée **avant** l'envoi : tâche rejouée ou lancée trois fois en parallèle = un seul courriel. Si personne n'a pu être joint (panne du service de courriel), la réservation est retirée et le rappel part le lendemain. Une panne n'arrête pas la tâche ni les rappels de commandes.

**Courriels de paiement** (après validation en base, sans jamais faire échouer la décision, y compris sans clé Resend) : déclaration → comptes SUPERADMIN ayant une adresse ; confirmation (avec numéro de facture), rejet (avec motif), remboursement → administrateurs de l'atelier. Rejouer une décision n'envoie rien.

**Un défaut trouvé par les tests, corrigé.** Un renouvellement planifié qui démarrait quelques millisecondes après l'échéance en cours n'était pas reconnu comme prolongation : l'atelier aurait reçu un rappel d'expiration alors qu'il avait renouvelé. La continuité tolère maintenant un écart d'un jour (une activation manuelle peut démarrer le lendemain à minuit). Le défaut est apparu seulement quand la suite complète tournait en parallèle (écart d'horloge entre deux créations), pas en exécution isolée.

**Limites :**
- le rappel est calculé une fois par jour : un atelier qui renouvelle après le courriel du matin le reçoit quand même ;
- les courriels dépendent de Resend : sans `RESEND_API_KEY` (ou avec l'expéditeur de test `onboarding@resend.dev`), rien ne part ou la délivrabilité est mauvaise — configurer un domaine vérifié reste à faire (voir `docs/SECURITE.md`) ;
- seuls les administrateurs de l'atelier avec une adresse sont prévenus ; aucun SMS ni notification dans l'application avant la 5.7 ;
- les textes sont en français uniquement (comme les autres courriels existants) ;
- les nouveaux ateliers inscrits avant la mise en ligne de cette fonction et dont l'essai finit dans les 3 jours suivant le déploiement recevront un rappel.
