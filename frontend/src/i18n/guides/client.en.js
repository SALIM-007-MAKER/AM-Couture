// Client guide — English.
export default {
  title: "Client guide",
  subtitle: "To follow your orders, measurements and payments at your workshop, without having to phone.",
  intro:
    "Your workshop gives you access to a personal space. You only see your own information. You cannot edit it yourself (contact the workshop for that), but you can send order requests, download your receipts and manage your personal data. Words in quotation marks are the exact labels used in the application.",
  sections: {
    activer: {
      title: "Activating your account and signing in",
      steps: {
        invitation: {
          text: "Your workshop sends you an invitation link by email, or passes it on directly (WhatsApp, SMS…). Open it, choose a [[activation.password]] of at least 8 characters, confirm it with [[activation.confirmPassword]], then click [[activation.submit]]. The link is personal, works only once and is valid for 7 days: if it expired or is lost, ask the workshop for a new one.",
          result: "The message [[activation.success]] appears and you land in your space.",
        },
        connexion: {
          text: "Next time, open the sign-in page and click [[login.clientToggleAction]]. Enter your [[login.clientIdentifiant]] (the one the workshop recorded on your record) and your password, then click [[login.submit]].",
          result: "You arrive in your client space.",
        },
        oubli: {
          text: "If you forgot your password, click [[login.forgotPassword]] on the sign-in page, enter your identifier then click [[auth.forgot.send]]. A reset link is sent if an email is linked to your account; otherwise, ask the workshop to invite you again.",
          result: "You receive a link to choose a new password.",
        },
      },
    },
    reperes: {
      title: "Finding your way around",
      steps: {
        menu: {
          text: "On a computer, the tabs at the top give access to your screens: [[nav.profile]], [[nav.orders]], [[nav.measurements]], [[nav.payments]], [[nav.requests]] and [[nav.receipts]]. Click a tab to open it.",
          result: "The chosen screen appears.",
        },
        mobile: {
          text: "On a phone, the bottom bar gives access to profile, orders, measurements, payments and requests. Your receipts are in the menu opened by the button at the top left ([[nav.openMenu]]).",
          result: "All your screens are reachable from the phone.",
        },
        cloche: {
          text: "The bell at the top right opens [[nav.notifications]]: what happens between you and your workshop (order recorded, status change, payment, delivery, receipt, answer to a request). A red badge shows the number of new items. Click [[client.marquerLu]] to mark a notification as read.",
          result: "The badge goes down as you read.",
        },
        profil: {
          text: "[[nav.profile]] shows the information your workshop recorded about you (phone, email, address). It cannot be edited here: for any correction, contact the workshop directly.",
          result: "You check that your details are up to date.",
        },
      },
    },
    commandes: {
      title: "Following your orders and measurements",
      steps: {
        liste: {
          text: "Open [[nav.orders]]: each order shows its status, its planned delivery date and what is left to pay.",
          result: "You see all your orders at the workshop.",
        },
        detail: {
          text: "Click an order. The record shows the [[client.sectionDetails]], the [[client.sectionFinances]] ([[client.prixTotal]], [[client.paye]], [[client.resteAPayer]]), the list of your payments and your deliveries.",
          result: "You know where your order stands and how much is left to pay.",
        },
        etapes: {
          text: "At the top of the record, [[etapes.titre]] shows the current step: [[cmdConst.statut.NOUVELLE]], [[cmdConst.statut.EN_CONFECTION]], [[cmdConst.statut.ESSAYAGE]], [[cmdConst.statut.RETOUCHES]], [[cmdConst.statut.TERMINEE]] (ready to collect) then [[cmdConst.statut.LIVREE]]. You are also notified of each change.",
          result: "When the order is finished, you can come and collect it.",
        },
        mesures: {
          text: "Open [[nav.measurements]] to see the history of measurements taken by your workshop. They are recorded by the workshop, not by you.",
          result: "You find your measurements at any time.",
        },
      },
    },
    paiements: {
      title: "Payments and receipts",
      steps: {
        voir: {
          text: "Open [[nav.payments]] to see the history of your payments, all orders together.",
          result: "You find every payment recorded by the workshop.",
        },
        recus: {
          text: "Open [[nav.receipts]] to find the documents issued for your payments and orders, and download their PDF.",
          result: "You keep a proof of each payment.",
        },
        generer: {
          text: "In an order's record, click [[client.genererRecu]] to get a summary receipt, then [[client.telecharger]] to open it.",
          result: "The message “Receipt … generated” appears and the receipt is in [[nav.receipts]].",
        },
        regler: {
          text: "Payments are not made in the application: pay the workshop directly (cash, mobile money…). The workshop records the payment; you then receive a notification and the remaining amount updates.",
          result: "Your payment appears in [[nav.payments]] as soon as the workshop has recorded it.",
        },
      },
    },
    demandes: {
      title: "Asking for a new garment",
      steps: {
        ouvrir: {
          text: "Open [[nav.requests]] then click [[client.nouvelleDemande]].",
          result: "The request form opens.",
        },
        ecrire: {
          text: "Describe what you want in the description field: type of garment, fabric, occasion, wanted deadline. Click [[client.envoyerDemande]].",
          result: "The request is sent to the workshop, which will contact you; it appears in [[nav.requests]] with the status [[demStatut.EN_ATTENTE]].",
        },
        suivre: {
          text: "When the workshop handles your request, its status becomes [[demStatut.ACCEPTEE]] (a link takes you to the order) or [[demStatut.REFUSEE]] (the reason is shown). You are notified.",
          result: "You know what happened to your request.",
        },
      },
    },
    notifications: {
      title: "Your notifications",
      steps: {
        lire: {
          text: "Open the bell: each line shows an event (for example [[notificationsClient.PAIEMENT_ENREGISTRE]] or [[notificationsClient.RECU_EMIS]]). Click [[client.marquerLu]] to mark it as read.",
          result: "Your activity feed is up to date.",
        },
      },
    },
    donnees: {
      title: "Your personal data",
      intro: "You stay in control of what the workshop holds about you.",
      steps: {
        ouvrir: {
          text: "In [[nav.profile]], go down to the [[mesdonnees.titre]] section.",
          result: "You see the two actions: download your data and delete your account.",
        },
        exporter: {
          text: "Click [[mesdonnees.exporter]]: you get a file with everything the workshop holds about you (profile, measurements, orders, payments, receipts and requests).",
          result: "The file is downloaded to your device.",
        },
        supprimer: {
          text: "To close your account, click [[mesdonnees.supprimer]], enter [[mesdonnees.motDePasse]] then click [[mesdonnees.confirmer]]. Your access is closed immediately and the workshop is responsible for erasing your personal data (name, phone, address, measurements). Your past orders and payments stay in the workshop's accounts, without your identity. To regain access, the workshop must invite you again.",
          result: "You are signed out and can no longer sign in with this account; this is final.",
        },
      },
    },
    langue: {
      title: "Language of the client space",
      steps: {
        choisir: {
          text: "The sign-in page offers an FR / EN button. If you choose English before signing in, your space is shown in English, but only until the page is next reloaded: there is no language selector in the client space, and your account's language, French, applies afterwards. For another account language, ask your workshop.",
          result: "You know your space is shown in French, except during the session where you chose English at sign-in.",
        },
      },
    },
  },
};
