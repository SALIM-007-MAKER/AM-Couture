# Espaces de travail par métier

L'accueil `/` est ouvert à tout membre de l'atelier. Le PDG y retrouve son tableau de bord ; un employé arrive dans
l'espace de son poste. C'est **une seule application et un seul système de droits** : un espace ne donne jamais accès à
quoi que ce soit, il choisit seulement ce qu'on met en avant. Le serveur revérifie chaque requête.

Code : `frontend/src/features/accueil/` (`espaces.js` : logique pure et testée ; `AccueilPage.jsx` : affichage).

## Règles

- L'espace est choisi par le **poste** (`espaceDe`) : PDG, couturier, réceptionniste, magasinier, comptable ; « general »
  pour le poste AUTRE ou un poste inconnu.
- Une section s'affiche seulement si l'employé a **toutes** les permissions qu'elle exige (`SECTIONS_PAR_ESPACE`). Les
  permissions étant ajustables employé par employé, deux comptables n'ont pas forcément les mêmes sections.
- Les raccourcis suivent la même règle (`ACTIONS_PAR_ESPACE`).
- Le PDG garde `DashboardPage` sans modification.
- Un employé qui a `dashboard.lire` garde l'accès au tableau de bord complet via `/tableau-de-bord`.

| Espace | Sections |
|---|---|
| Couturier | Mes commandes à confectionner (affectées à lui, échéance la plus proche d'abord) |
| Réceptionniste | Demandes à traiter, commandes prêtes à livrer, commandes en retard |
| Magasinier | Stock sous le seuil, marchandises attendues |
| Comptable | Indicateurs du mois, derniers paiements, dernières dépenses |

Il n'y a pas de section « rendez-vous » : le modèle de données n'en contient pas.

## Tableau de bord complet d'une réceptionniste (ancien problème, corrigé)

**Constat initial.** Sur `/tableau-de-bord`, un compte réceptionniste recevait un 403 sur deux appels
(`GET /api/rapports/commandes/en-retard` et `/a-livrer`) : le poste RECEPTIONNISTE a `dashboard.lire` mais pas
`rapports.lire`, que tout le routeur `/api/rapports` exige. Trois zones de la page (encart « En retard », encart
« À livrer », compteur « Livraison ≤ 3 j ») restaient en erreur. Le défaut datait de la création du poste.

**Correction.** Les deux listes sont aussi servies par `GET /api/dashboard/commandes/en-retard` et
`GET /api/dashboard/commandes/a-livrer`, qui exigent `dashboard.lire` **et** `commandes.lire`. L'implémentation est
unique et partagée avec les routes Rapports (`backend/src/lib/listesCommandes.js`) : mêmes requêtes, même format de
réponse (dont `joursDeRetard`), même isolation par atelier, mêmes montants masqués sans `finances.voir`. Le
tableau de bord (`features/dashboard/hooks.js`) utilise ces routes ; la page Rapports garde les siennes.

**Ce qui n'a pas changé.** Aucune permission de poste n'est modifiée : la réceptionniste n'a toujours pas
`rapports.lire` et reçoit toujours 403 sur `/api/rapports/*`. Test : `dashboard-listes-commandes.test.js`.

**Limite.** Un compte qui aurait `dashboard.lire` sans `commandes.lire` (permissions personnalisées ; aucun poste de
base) reçoit 403 sur ces deux listes et sur les « commandes récentes ».
