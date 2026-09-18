// Traductions FR — zone "clientes" (fiche/formulaire client, mesures, modèles, calendrier,
// notifications, paramètres, abonnement). Fusionnées par i18n/fr.js.
export default {
  "cli": {
    "sexe": {
      "FEMME": "Femme",
      "HOMME": "Homme",
      "AUTRE": "Autre"
    },
    "mesure": {
      "epaule": "Épaule",
      "poitrine": "Poitrine",
      "taille": "Taille",
      "hanches": "Hanches",
      "longueur": "Longueur",
      "longueurRobe": "Longueur robe",
      "longueurJupe": "Longueur jupe",
      "longueurPantalon": "Longueur pantalon",
      "longueurManche": "Longueur manche",
      "tourBras": "Tour de bras",
      "tourCou": "Tour de cou",
      "tourPoignet": "Tour de poignet",
      "tourCuisse": "Tour de cuisse",
      "tourGenou": "Tour de genou"
    },
    "group": {
      "haut": "Haut du corps",
      "bras": "Bras",
      "bas": "Bas du corps",
      "longueurs": "Longueurs"
    },
    "detail": {
      "loading": "Chargement de la fiche…",
      "confirmRestore": "Restaurer ce client ?",
      "confirmArchive": "Archiver ce client ?",
      "information": "Informations",
      "notes": "Notes",
      "accountActive": "Compte client actif — {{prenom}} peut suivre ses commandes en ligne.",
      "newOrder": "Nouvelle commande",
      "totalOrders": "Total commandes",
      "totalPaid": "Total payé",
      "totalRemaining": "Total restant",
      "newMeasure": "Nouvelle mesure"
    },
    "history": {
      "loadingOrders": "Chargement des commandes…",
      "noOrders": "Aucune commande pour ce client."
    },
    "rappel": {
      "send": "Envoyer un rappel"
    },
    "form": {
      "archivedError": "Ce client est archivé : restaurez-le avant de le modifier.",
      "editTitle": "Modifier le client",
      "lastName": "Nom",
      "firstName": "Prénom",
      "emailHint": "Optionnel — permet d'envoyer automatiquement le lien d'invitation.",
      "unspecified": "Non précisé"
    }
  },
  "demStatut": {
    "EN_ATTENTE": "En attente",
    "ACCEPTEE": "Acceptée",
    "REFUSEE": "Refusée"
  },
  "modele": {
    "categorie": {
      "ROBE": "Robe",
      "BOUBOU": "Boubou",
      "ENSEMBLE": "Ensemble",
      "PANTALON": "Pantalon",
      "CHEMISE": "Chemise",
      "JUPE": "Jupe",
      "KAFTAN": "Kaftan",
      "COSTUME": "Costume",
      "TENUE_TRADITIONNELLE": "Tenue traditionnelle",
      "AUTRE": "Autre"
    },
    "list": {
      "subtitle": "Catalogue des modèles proposés par l'atelier.",
      "new": "Nouveau modèle",
      "search": "Rechercher (nom, description)…",
      "allCategories": "Toutes catégories",
      "loading": "Chargement des modèles…",
      "emptyFiltered": "Aucun modèle ne correspond à ces critères.",
      "emptyAll": "Aucun modèle pour l'instant.",
      "colName": "Nom",
      "colCategory": "Catégorie",
      "colPrice": "Prix indicatif"
    },
    "detail": {
      "loading": "Chargement du modèle…",
      "confirmRestore": "Restaurer ce modèle ?",
      "confirmArchive": "Archiver ce modèle ?"
    },
    "form": {
      "archivedError": "Ce modèle est archivé : restaurez-le avant de le modifier.",
      "editTitle": "Modifier le modèle",
      "choose": "Choisir…",
      "photo": "Photo"
    }
  },
  "notif": {
    "label": {
      "RETARD": "En retard",
      "PRET": "Prête",
      "LIVRAISON_PROCHE": "Livraison proche",
      "IMPAYE": "Impayée"
    },
    "msg": {
      "RETARD": "{{numero}} ({{modele}}) — en retard, livraison prévue le {{date}}.",
      "PRET": "{{numero}} ({{modele}}) — prête à récupérer (statut : {{statut}}).",
      "LIVRAISON_PROCHE": "{{numero}} ({{modele}}) — à livrer le {{date}}.",
      "IMPAYE": "{{numero}} ({{modele}}) — aucun paiement enregistré."
    },
    "filterAll": "Toutes",
    "filterUnread": "Non lues",
    "filterRead": "Lues",
    "subtitle": "Alertes automatiques : retards, commandes prêtes, livraisons proches, impayés.",
    "pendingRequests": "{{nombre}} demande{{plural}} de commande en attente de traitement.",
    "selected": "{{nombre}} sélectionnée(s)",
    "markSelectedRead": "Marquer comme lues",
    "confirm": "Confirmer",
    "selectAll": "Tout sélectionner sur cette page",
    "selectOne": "Sélectionner cette notification",
    "markUnread": "Marquer non lue",
    "markRead": "Marquer lue"
  },
  "mesure": {
    "card": {
      "noStructured": "Aucune mesure structurée renseignée."
    },
    "history": {
      "empty": "Aucune mesure enregistrée pour ce client."
    },
    "form": {
      "loadingClient": "Chargement du client…",
      "archivedError": "Ce client est archivé : restaurez-le avant d'enregistrer des mesures.",
      "title": "Nouvelle prise de mesures",
      "subtitle": "{{nom}} — toutes les mesures sont en centimètres et facultatives. Un nouvel enregistrement est toujours créé, l'historique reste consultable sur la fiche client.",
      "unit": "cm",
      "extra": "Mesures supplémentaires",
      "add": "Ajouter",
      "labelPlaceholder": "Libellé (ex : tour de mollet)",
      "valuePlaceholder": "Valeur",
      "removeRow": "Supprimer cette ligne"
    }
  },
  "cal": {
    "subtitle": "Commandes par date de livraison prévue.",
    "prevMonth": "Mois précédent",
    "nextMonth": "Mois suivant",
    "loading": "Chargement du calendrier…",
    "newOrderThatDay": "Nouvelle commande ce jour",
    "noOrders": "Aucune commande à livrer ce jour-là.",
    "noModel": "Sur mesure (sans modèle)"
  },
  "param": {
    "loading": "Chargement des paramètres…",
    "title": "Paramètres de l'atelier",
    "notConfigured": "Aucune configuration existante — remplissez au moins le nom et la devise pour créer la fiche de l'atelier.",
    "appearance": "Apparence",
    "theme": "Thème",
    "themeHint": "Choisissez l'apparence de l'application, clair ou sombre.",
    "saved": "Enregistré.",
    "workshop": "Atelier",
    "workshopName": "Nom de l'atelier",
    "currency": "Devise",
    "slogan": "Slogan",
    "logo": "Logo",
    "receiptsTitle": "Reçus & informations de paiement",
    "receiptsHint": "Chaque ligne s'affiche sur le PDF du reçu sous la forme « Clé : Valeur » — mentions légales, Orange Money, RIB, ou tout autre champ utile à faire figurer sur le reçu remis au client.",
    "receiptsEmpty": "Aucune information complémentaire configurée.",
    "keyPlaceholder": "Clé (ex : Orange Money)"
  }
};
