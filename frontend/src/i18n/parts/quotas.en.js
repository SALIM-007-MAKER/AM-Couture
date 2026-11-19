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
      limitsHint: "Leave a field empty for “unlimited”. Whole numbers from 1 to 1,000,000. These limits are copied into each new subscription: subscriptions already taken are not changed.",
      limitsPlaceholder: "Unlimited",
      limitsNone: "No quota: every resource is unlimited.",
    },
  },
};
