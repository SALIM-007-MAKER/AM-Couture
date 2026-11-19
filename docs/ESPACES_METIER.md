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

## Problème connu : deux API renvoient 403 sur le tableau de bord complet d'une réceptionniste

**Constaté** (vérification du 19 novembre 2026, compte de test réceptionniste) : sur `/tableau-de-bord`, deux appels
échouent en 403 :

- `GET /api/rapports/commandes/en-retard`
- `GET /api/rapports/commandes/a-livrer`

**Cause.** Le poste RECEPTIONNISTE (`backend/src/lib/permissions.js`) a `dashboard.lire` mais pas `rapports.lire`. Tout
le routeur `/api/rapports` exige `rapports.lire` (`rapports.routes.js`, `router.use(... requirePermission("rapports.lire"))`),
alors que `DashboardPage.jsx` appelle ces deux routes (listes « en retard » et « à livrer »). Les deux encarts de la
page affichent donc une erreur pour tout employé qui a `dashboard.lire` sans `rapports.lire`.

**Ancienneté.** Le défaut existe depuis la création du poste : avant les espaces métiers, ce tableau de bord était
l'accueil de la réceptionniste. Les espaces métiers ne l'ont pas introduit ; ils le rendent seulement moins visible, car
l'accueil de la réceptionniste utilise `GET /api/commandes` (`commandes.lire`), qui fonctionne.

**Comportement conservé volontairement.** Les permissions de la réceptionniste n'ont pas été modifiées et
`DashboardPage.jsx` non plus. Aucun accès supplémentaire n'a été accordé pour masquer le symptôme.

**Pistes de correction (à décider)**

1. Dans `DashboardPage.jsx`, ne pas afficher les deux listes (ou les alimenter depuis `GET /api/commandes?enRetard=true`
   et `?statut=TERMINEE`, qui exigent `commandes.lire`) quand l'utilisateur n'a pas `rapports.lire`. Ne donne aucun droit
   de plus, mais modifie la page du PDG.
2. Retirer `dashboard.lire` du poste RECEPTIONNISTE : son accueil lui suffit déjà, le lien « Tableau de bord complet »
   disparaît. Les comptes existants gardent leurs permissions déjà accordées (un poste n'est qu'un modèle).
3. Accorder `rapports.lire` à la réceptionniste : donne accès à tous les rapports, y compris financiers selon
   `finances.voir`. À éviter sans décision explicite.
