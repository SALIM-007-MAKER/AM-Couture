// English translations — commercial quotas of subscription plans (limits, usage, errors). Namespace "quotas".
export default {
  quotas: {
    ressources: {
      clientes: "Clients",
      employes: "Employees",
      commandesActives: "Active orders",
      modeles: "Models",
    },
    illimite: "Unlimited",
    nonDefini: "Not defined",
    atteint: {
      clientes: "Your plan does not allow adding a client: the limit of {{limite}} is reached ({{usage}} in use). Archive a record or change plan.",
      employes: "Your plan does not allow adding an employee: the limit of {{limite}} is reached ({{usage}} in use). Deactivate an account or change plan.",
      commandesActives: "Your plan does not allow adding an order: the limit of {{limite}} active orders is reached ({{usage}} in use). Finish or cancel an order, or change plan.",
      modeles: "Your plan does not allow adding a model: the limit of {{limite}} is reached ({{usage}} in use). Archive a model or change plan.",
    },
    utilisation: {
      titre: "Your plan usage",
      usage: "{{usage}} of {{limite}}",
      usageIllimite: "{{usage}} (unlimited)",
      etat: {
        ok: "Within limit",
        proche: "Almost reached",
        atteint: "Limit reached",
        depasse: "Over the limit",
        illimite: "Unlimited",
      },
      plancher: "limit kept to protect your current usage",
      raison: {
        ESSAI: "Free trial: no limit during the trial. Your plan's limits will apply once it is activated, after the trial ends.",
        ILLIMITE: "Your {{formule}} plan has no limit: every resource is unlimited.",
        AUCUN: "No limit currently applies to your workshop.",
        ABONNEMENT: "Limits of your {{formule}} plan. They stay those of your subscription until it ends.",
        GRACE: "Grace period: the limits of your last plan ({{formule}}) still apply.",
        SUSPENDU: "Subscription suspended: the limits of your plan ({{formule}}) are still shown.",
      },
      noteLimite: "When a limit is reached you can keep viewing, editing and exporting everything: only creating a new item of that type is refused. No data is ever deleted.",
      voirAbonnement: "See my plan",
    },
    admin: {
      limitsTitle: "Plan quotas",
      limitsHint: "For each resource, enter a limit (whole number from 1 to 1,000,000) or tick “Unlimited”. An empty field is NOT DEFINED: the plan cannot be activated until all four quotas are decided. These limits are copied into each new subscription: subscriptions already taken are not changed.",
      limitsPlaceholder: "Unlimited",
      voirDepassements: "Workshops above these limits",
      masquerDepassements: "Hide",
      aucunDepassement: "No workshop currently exceeds these limits.",
      depassementsNote: "These workshops would already exceed this plan. None is blocked or modified: only creating new items would be refused if they subscribe.",
      limitsNone: "No quota: every resource is unlimited.",
    },
  },
};
