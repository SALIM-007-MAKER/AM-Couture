// Traductions FR — quotas commerciaux des formules (limites, utilisation, erreurs). Namespace « quotas ».
export default {
  quotas: {
    ressources: {
      clientes: "Clientes",
      employes: "Employés",
      commandesActives: "Commandes actives",
      modeles: "Modèles",
    },
    illimite: "Illimité",
    // Message d'une création refusée (409, details.quota) — {{limite}} et {{usage}} viennent du serveur.
    atteint: {
      clientes: "Votre formule ne permet pas d'ajouter de cliente : la limite de {{limite}} est atteinte ({{usage}} en cours). Archivez une fiche ou changez de formule.",
      employes: "Votre formule ne permet pas d'ajouter d'employé : la limite de {{limite}} est atteinte ({{usage}} en cours). Désactivez un compte ou changez de formule.",
      commandesActives: "Votre formule ne permet pas d'ajouter de commande : la limite de {{limite}} commandes actives est atteinte ({{usage}} en cours). Terminez ou annulez une commande, ou changez de formule.",
      modeles: "Votre formule ne permet pas d'ajouter de modèle : la limite de {{limite}} est atteinte ({{usage}} en cours). Archivez un modèle ou changez de formule.",
    },
    admin: {
      limitsTitle: "Quotas de la formule",
      limitsHint: "Laissez un champ vide pour « illimité ». Entiers de 1 à 1 000 000. Ces limites sont copiées dans chaque nouvel abonnement : les abonnements déjà souscrits ne changent pas.",
      limitsPlaceholder: "Illimité",
      limitsNone: "Aucun quota : toutes les ressources sont illimitées.",
    },
  },
};
