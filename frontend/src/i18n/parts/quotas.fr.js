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
    utilisation: {
      titre: "Utilisation de votre formule",
      usage: "{{usage}} sur {{limite}}",
      usageIllimite: "{{usage}} (illimité)",
      etat: {
        ok: "Dans la limite",
        proche: "Bientôt atteinte",
        atteint: "Limite atteinte",
        depasse: "Au-dessus de la limite",
        illimite: "Illimité",
      },
      plancher: "limite conservée pour protéger votre usage actuel",
      raison: {
        ESSAI: "Essai gratuit : aucune limite pendant l'essai. Les limites de votre formule s'appliqueront à son activation, une fois l'essai terminé.",
        AUCUN: "Aucune limite ne s'applique actuellement à votre atelier.",
        ABONNEMENT: "Limites de votre formule {{formule}}. Elles restent celles de votre abonnement jusqu'à son terme.",
        GRACE: "Période de grâce : les limites de votre dernière formule ({{formule}}) restent appliquées.",
        SUSPENDU: "Abonnement suspendu : les limites de votre formule ({{formule}}) restent affichées.",
      },
      noteLimite: "Quand une limite est atteinte, vous pouvez continuer à tout consulter, modifier et exporter : seule la création d'un nouvel élément de ce type est refusée. Aucune donnée n'est jamais supprimée.",
      voirAbonnement: "Voir ma formule",
    },
    admin: {
      limitsTitle: "Quotas de la formule",
      limitsHint: "Laissez un champ vide pour « illimité ». Entiers de 1 à 1 000 000. Ces limites sont copiées dans chaque nouvel abonnement : les abonnements déjà souscrits ne changent pas.",
      limitsPlaceholder: "Illimité",
      voirDepassements: "Ateliers au-dessus de ces limites",
      masquerDepassements: "Masquer",
      aucunDepassement: "Aucun atelier ne dépasse actuellement ces limites.",
      depassementsNote: "Ces ateliers dépasseraient déjà cette formule. Aucun n'est bloqué ni modifié : seule la création de nouveaux éléments serait refusée s'ils y souscrivent.",
      limitsNone: "Aucun quota : toutes les ressources sont illimitées.",
    },
  },
};
