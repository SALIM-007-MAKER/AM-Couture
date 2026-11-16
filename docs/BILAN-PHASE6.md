# Bilan de la phase 6 — Employés, production, fournisseurs, achats, notifications et rapports

Chiffres relevés le 16 novembre 2026 en exécutant les commandes indiquées, en local (Windows, Postgres 17 dans Docker). **Rien n'a été exécuté sur GitHub, Vercel, Neon ni Resend.** Documents liés : [PHASE6-ANALYSE.md](PHASE6-ANALYSE.md) (analyse, décisions du 15/11, détail par sous-phase §8 à §14), [API.md](API.md), [TESTS.md](TESTS.md), [INVARIANTS.md](INVARIANTS.md). La phase 6 a été **mise en pause après la 6.6** pour réaliser la phase 7 (décision du 16/11) puis terminée par la 6.7 et ce bilan ; les chiffres de test « actuels » incluent donc aussi les ajouts de la phase 7.

## 1. Synthèse

| | |
|---|---|
| Ce qui fonctionne | comptes employés avec postes et permissions fines relues à chaque requête, aucune fuite de montant vers un employé sans `finances.voir`, affectation des commandes avec historique, page Production, fournisseurs, achats avec réception en stock et paiement en dépense, alertes individuelles, lecture « lu » par personne, cinq rapports avancés |
| Ce qui est volontairement **simple** | production = affectation + statut existant (pas d'étapes détaillées) ; un seul paiement par achat ; notifications dans l'application seulement ; marge = ordre de grandeur |
| Ce qui reste à **valider avec de vrais ateliers** | le catalogue de permissions (28) et les postes (couturier, réceptionniste, magasinier, comptable) : une proposition, jamais confrontée à l'usage réel |
| Tests de la suite (état actuel, phase 7 comprise) | **1 018** : 344 unitaires backend, 124 frontend, 7 déploiement, 460 d'intégration (dont 1 `TODO` volontaire), 83 de bout en bout. Dernière exécution : 1 017 réussis, 0 échec, 1 `TODO` |
| Fin de la 6.6 (avant la phase 7) | 333 unitaires backend, 97 frontend, 364 intégration, 55 E2E, contre 302 / 80 / 269 / 35 à la fin de la phase 5 |
| Migrations | 5, **toutes additives** : `employes_permissions`, `affectation_commandes`, `fournisseurs`, `achats`, `notifications_employes` (seule modification non purement additive : `Notification.commandeId` devenu facultatif, avec un `CHECK` imposant une référence) |
| Routes documentées | 157 à la fin de la phase 5, 181 à la fin de la 6.5, puis 5 de plus en 6.7 ; **200 au total** avec la phase 7, vérifiées par test contre le code |

## 2. Les 10 points de la mission

| # | Point | État | Remarque |
|---|---|---|---|
| 1 | Employés | **Fait** | Rôle `EMPLOYE`, création/modification/désactivation par le PDG ; désactivation immédiate, jamais de suppression. Pas de limite par formule d'abonnement, pas de changement de mot de passe forcé à la première connexion |
| 2-3 | Rôles et permissions | **Fait** | 28 permissions (lire/écrire par module + droits distincts), 5 postes-modèles qui ne font que pré-remplir. Droits sensibles (argent) accordés après confirmation par le mot de passe du PDG. Administration (employés, paramètres, abonnement) **non délégable** |
| 4-5 | Attribution et suivi de production | **Fait, simple** | Une commande ouverte = un responsable ; historique conservé ; « Mes travaux », retards, charge. **Pas d'étapes détaillées** (décision). Le droit de changer un statut vaut pour toute commande, pas seulement les siennes |
| 6 | Fournisseurs | **Fait** | Annuaire, archivage, nom unique par atelier sous verrou |
| 7 | Achats | **Fait** | Bon de commande, réception partielle ou totale, annulation tracée. **Un seul paiement du total** ; lignes non modifiables après création ; pas de retour fournisseur |
| 8 | Approvisionnement | **Fait** | Réception = entrées de stock dans la même transaction ; `CHECK` en base sur les quantités. Pas de fournisseur habituel par article |
| 9 | Notifications | **Fait, dans l'application** | 3 nouveaux types (tâche confiée, stock bas, achat en retard), individuelles, dérivées de l'état réel. **Ni poussée, ni courriel individuel**, ni réglage par personne |
| 10 | Rapports | **Fait** | Production par employé, retards, achats par fournisseur, dépenses par catégorie, marges simples, permission distincte. Pas d'export ni de graphique |

## 3. Consignes de la mission

| Consigne | Comment elle est tenue |
|---|---|
| Analyser d'abord l'existant | `PHASE6-ANALYSE.md` §1 à §7 avant tout code |
| Pas de fuite financière vers un employé | Les montants sont retirés de toutes les réponses sans `finances.voir`. **Garde-fou** : un test lit `schema.prisma` et échoue si une colonne `Decimal` n'est pas classée financière ou non |
| Droits relus à chaque requête | Retirer un droit ou désactiver un compte agit immédiatement, sans requête SQL supplémentaire (testé) |
| Comportement du PDG inchangé | Les tests d'intégration existants passent sans modification (un seul test de la 6.1 mis à jour : la limite « un employé ne peut pas marquer lu » a été levée en 6.6) |
| Isolation entre ateliers | Chaque nouvelle table porte l'atelier ou s'y rattache ; testé pour chaque module, y compris les rapports |
| Pas de double saisie | Achat payé = **une** dépense ; réception = mouvements de stock existants ; l'état de paiement se lit sur la dépense, jamais stocké |
| Tester avant d'affirmer | Chaque sous-phase : tests d'intégration, E2E, **mutations** (règle cassée volontairement, le test doit échouer) |
| Migrations sans risque | Additives, retour arrière documenté pour chacune, rejeu sur base peuplée |

## 4. Changements de comportement à connaître

1. **Résumé quotidien par courriel** : il partait à tout compte ayant une adresse (donc aussi un employé, avec le décompte des impayées). Corrigé en 6.6 : il est réservé au PDG.
2. **Alertes visibles** : un employé sans gestion des commandes ne voit plus les alertes des commandes qui ne lui sont pas confiées.
3. **`POST /api/auth/login`** renvoie désormais `poste` et `permissions` (bug trouvé par un test E2E : l'employé voyait une interface vide jusqu'au rechargement).
4. **Trois définitions du retard coexistent** : la production et les rapports avancés (jour UTC, ouverte tant que non livrée), les alertes de notification (statut non terminé et date dépassée) et l'ancien rapport « en retard » (comparaison à l'instant exact). Elles peuvent différer d'une commande le jour même ou pour une commande `TERMINEE` non livrée. **À harmoniser** si les ateliers s'en plaignent ; non fait pour ne pas modifier des comportements existants.

## 5. Ce qui reste à faire, par priorité

**Avant le déploiement (bloquant)**
1. **Point de restauration Neon**, puis `prisma migrate deploy` (voir aussi le bilan de la phase 7 §4). **Ne pas déployer la 6.1 sans la 6.2** : un employé verrait l'interface du PDG avec des erreurs 403 (les deux sont fusionnées ensemble dans `main`).
2. `ci-ok` comme vérification obligatoire de la branche protégée.

**À valider avec de vrais ateliers**
3. Le catalogue de permissions et les postes.
4. Les noms de catégories de dépenses (texte libre : « Tissu » et « tissu » sont deux catégories dans le rapport).
5. Si une marge par commande est souhaitée : cela suppose de saisir un coût de revient (consommation de tissu par commande, main-d'œuvre), qui n'existe pas dans le modèle.

**Améliorations possibles (non demandées)**
6. Restreindre le changement de statut aux commandes confiées à l'employé.
7. Plusieurs paiements par achat ; modification des lignes d'un achat ; retours fournisseur.
8. Alertes poussées ou par courriel individuel, avec réglage par personne.
9. Limite du nombre d'employés par formule d'abonnement ; mot de passe à changer à la première connexion.
10. Export CSV et comparaison avec la période précédente dans les rapports avancés.

## 6. Risques connus

- **Permissions : une erreur d'attribution est une fuite.** Les droits sensibles exigent le mot de passe du PDG, mais `commandes.statut` ou `achats.recevoir` donnés trop largement restent possibles. Le journal de sécurité garde la trace de chaque attribution.
- **Attribution des rapports** : une commande est comptée pour l'employé qui en est chargé *aujourd'hui* ; réaffectée après coup, elle change de compteur.
- **Interface mobile et anglais** des écrans de la phase 6 non vérifiés visuellement ; champs de prix des formulaires modèle/stock affichés vides (sans fuite) pour un employé sans `finances.voir`.
- **Une erreur de catégorie de dépense** (texte libre) fausse le rapport par catégorie.

## 7. Reproduire les mesures

```bash
export TEST_DATABASE_URL=postgresql://test:test@localhost:55432/gestion_atelier_test
npm run test:integration                 # 460 tests, base locale uniquement
npm test                                 # 344 + 124 + 7
export E2E_DATABASE_URL=postgresql://test:test@localhost:55432/gestion_atelier_e2e
npm run test:e2e                         # 83 tests, navigateur réel
```
