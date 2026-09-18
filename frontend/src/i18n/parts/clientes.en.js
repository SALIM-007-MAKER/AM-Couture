// Traductions EN — zone "clientes" (fiche/formulaire client, mesures, modèles, calendrier,
// notifications, paramètres, abonnement). Fusionnées par i18n/en.js.
export default {
  "cli": {
    "sexe": {
      "FEMME": "Female",
      "HOMME": "Male",
      "AUTRE": "Other"
    },
    "mesure": {
      "epaule": "Shoulder",
      "poitrine": "Bust",
      "taille": "Waist",
      "hanches": "Hips",
      "longueur": "Length",
      "longueurRobe": "Dress length",
      "longueurJupe": "Skirt length",
      "longueurPantalon": "Trouser length",
      "longueurManche": "Sleeve length",
      "tourBras": "Arm circumference",
      "tourCou": "Neck circumference",
      "tourPoignet": "Wrist circumference",
      "tourCuisse": "Thigh circumference",
      "tourGenou": "Knee circumference"
    },
    "group": {
      "haut": "Upper body",
      "bras": "Arms",
      "bas": "Lower body",
      "longueurs": "Lengths"
    },
    "detail": {
      "loading": "Loading the record…",
      "confirmRestore": "Restore this client?",
      "confirmArchive": "Archive this client?",
      "information": "Information",
      "notes": "Notes",
      "accountActive": "Client account active — {{prenom}} can track their orders online.",
      "newOrder": "New order",
      "totalOrders": "Total orders",
      "totalPaid": "Total paid",
      "totalRemaining": "Total remaining",
      "newMeasure": "New measurement"
    },
    "history": {
      "loadingOrders": "Loading orders…",
      "noOrders": "No orders for this client."
    },
    "rappel": {
      "send": "Send a reminder"
    },
    "form": {
      "archivedError": "This client is archived: restore them before editing.",
      "editTitle": "Edit client",
      "lastName": "Last name",
      "firstName": "First name",
      "emailHint": "Optional — lets the invitation link be sent automatically.",
      "unspecified": "Not specified"
    }
  },
  "demStatut": {
    "EN_ATTENTE": "Pending",
    "ACCEPTEE": "Accepted",
    "REFUSEE": "Refused"
  },
  "modele": {
    "categorie": {
      "ROBE": "Dress",
      "BOUBOU": "Boubou",
      "ENSEMBLE": "Set",
      "PANTALON": "Trousers",
      "CHEMISE": "Shirt",
      "JUPE": "Skirt",
      "KAFTAN": "Kaftan",
      "COSTUME": "Suit",
      "TENUE_TRADITIONNELLE": "Traditional outfit",
      "AUTRE": "Other"
    },
    "list": {
      "subtitle": "Catalogue of the models offered by the workshop.",
      "new": "New model",
      "search": "Search (name, description)…",
      "allCategories": "All categories",
      "loading": "Loading models…",
      "emptyFiltered": "No model matches these criteria.",
      "emptyAll": "No models yet.",
      "colName": "Name",
      "colCategory": "Category",
      "colPrice": "Indicative price"
    },
    "detail": {
      "loading": "Loading the model…",
      "confirmRestore": "Restore this model?",
      "confirmArchive": "Archive this model?"
    },
    "form": {
      "archivedError": "This model is archived: restore it before editing.",
      "editTitle": "Edit model",
      "choose": "Choose…",
      "photo": "Photo"
    }
  },
  "notif": {
    "label": {
      "RETARD": "Overdue",
      "PRET": "Ready",
      "LIVRAISON_PROCHE": "Delivery soon",
      "IMPAYE": "Unpaid"
    },
    "msg": {
      "RETARD": "{{numero}} ({{modele}}) — overdue, delivery expected on {{date}}.",
      "PRET": "{{numero}} ({{modele}}) — ready for pickup (status: {{statut}}).",
      "LIVRAISON_PROCHE": "{{numero}} ({{modele}}) — to be delivered on {{date}}.",
      "IMPAYE": "{{numero}} ({{modele}}) — no payment recorded."
    },
    "filterAll": "All",
    "filterUnread": "Unread",
    "filterRead": "Read",
    "subtitle": "Automatic alerts: overdue orders, ready orders, upcoming deliveries, unpaid orders.",
    "pendingRequests": "{{nombre}} order request{{plural}} awaiting processing.",
    "selected": "{{nombre}} selected",
    "markSelectedRead": "Mark as read",
    "confirm": "Confirm",
    "selectAll": "Select all on this page",
    "selectOne": "Select this notification",
    "markUnread": "Mark as unread",
    "markRead": "Mark as read"
  },
  "abo": {
    "statut": {
      "EN_ATTENTE": "Awaiting payment",
      "ACTIF": "Active",
      "EXPIRE": "Expired",
      "ANNULE": "Cancelled"
    },
    "trx": {
      "EN_ATTENTE": "Pending",
      "REUSSIE": "Successful",
      "ECHOUEE": "Failed",
      "ANNULEE": "Cancelled",
      "EXPIREE": "Expired"
    },
    "trialEnded": "Free trial ended on {{date}}.",
    "trialLeft": "Free trial — {{jours}} day(s) left (until {{date}}).",
    "subtitle": "The workshop's access to the Gestion d'Atelier platform.",
    "verifying": "Wave payment being verified — the status below will update automatically once confirmed (never before a reliable server-side check).",
    "failed": "Wave payment cancelled or failed — you can try again below.",
    "currentStatus": "Current status",
    "planLine": "{{nom}} plan — {{prix}} FCFA",
    "expiresOn": "Expires on {{date}}",
    "expiredOn": "Expired on {{date}}",
    "none": "No subscription yet.",
    "subscribeRenew": "Subscribe / renew",
    "pendingManual": "Payments awaiting manual confirmation",
    "history": "History",
    "historyEmpty": "No subscriptions yet.",
    "loadingPlans": "Loading plans…",
    "mockBanner": "Test mode — no real API key is configured. Payments are simulated, no real money is moved.",
    "selectedPlan": "Plan",
    "paymentMethod": "Payment method",
    "manualNotice": "Manual confirmation: make the transfer to the workshop's {{moyen}} account, then enter the reference below. The subscription will only be activated after manual verification — this is not an automatic check.",
    "transferRef": "Transfer reference",
    "refPlaceholder": "{{moyen}} reference",
    "payWithWave": "Pay with Wave",
    "sendForConfirmation": "Send for confirmation",
    "requestSent": "Request sent — awaiting manual confirmation once the payment is verified.",
    "noPendingManual": "No payment awaiting manual confirmation.",
    "reference": "Reference",
    "reject": "Reject",
    "test": {
      "REUSSIE": "Simulate a successful payment",
      "ECHOUEE": "Simulate a failed payment",
      "ANNULEE": "Simulate a cancellation",
      "EXPIREE": "Simulate an expiry",
      "loading": "Loading the transaction…",
      "title": "Test payment",
      "subtitle": "{{moyen}} simulation — no real money is moved.",
      "plan": "Plan",
      "choose": "Choose the result to simulate for this payment attempt.",
      "redirecting": "Result simulated — redirecting to your subscription…"
    }
  },
  "mesure": {
    "card": {
      "noStructured": "No structured measurements recorded."
    },
    "history": {
      "empty": "No measurements recorded for this client."
    },
    "form": {
      "loadingClient": "Loading the client…",
      "archivedError": "This client is archived: restore them before recording measurements.",
      "title": "New measurements",
      "subtitle": "{{nom}} — all measurements are in centimetres and optional. A new record is always created; the history stays available on the client record.",
      "unit": "cm",
      "extra": "Additional measurements",
      "add": "Add",
      "labelPlaceholder": "Label (e.g. calf circumference)",
      "valuePlaceholder": "Value",
      "removeRow": "Remove this row"
    }
  },
  "cal": {
    "subtitle": "Orders by expected delivery date.",
    "prevMonth": "Previous month",
    "nextMonth": "Next month",
    "loading": "Loading the calendar…",
    "newOrderThatDay": "New order this day",
    "noOrders": "No orders to deliver that day.",
    "noModel": "Custom-made (no model)"
  },
  "param": {
    "loading": "Loading settings…",
    "title": "Workshop settings",
    "notConfigured": "No existing configuration — fill in at least the name and currency to create the workshop record.",
    "appearance": "Appearance",
    "theme": "Theme",
    "themeHint": "Choose the app's appearance, light or dark.",
    "saved": "Saved.",
    "workshop": "Workshop",
    "workshopName": "Workshop name",
    "currency": "Currency",
    "slogan": "Slogan",
    "logo": "Logo",
    "receiptsTitle": "Receipts & payment information",
    "receiptsHint": "Each line appears on the receipt PDF as “Key: Value” — legal notices, Orange Money, bank details, or any other field worth showing on the receipt given to the client.",
    "receiptsEmpty": "No additional information configured.",
    "keyPlaceholder": "Key (e.g. Orange Money)"
  }
};
