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
    admin: {
      limitsTitle: "Plan quotas",
      limitsHint: "Leave a field empty for “unlimited”. Whole numbers from 1 to 1,000,000. These limits are copied into each new subscription: subscriptions already taken are not changed.",
      limitsPlaceholder: "Unlimited",
      limitsNone: "No quota: every resource is unlimited.",
    },
  },
};
