// Owner (PDG) guide — English. Screen labels are written [[i18n.key]]: they are replaced by the real label of the interface.
export default {
  title: "Owner's guide",
  subtitle: "For the workshop owner: from creating the account to managing your team and your subscription.",
  intro:
    "You have full rights over your workshop. This guide follows the natural order: get started, record your clients, orders and payments, then organise your team. Words in quotation marks are the exact labels used in the application.",
  sections: {
    demarrer: {
      title: "Getting started",
      intro: "Create your workshop once; you get a 15-day free trial with full access.",
      steps: {
        inscription: {
          text: "On the sign-in page, click [[login.createWorkshop]]. Fill in [[auth.signup.workshopName]], [[auth.signup.firstName]], [[auth.signup.lastName]] and [[auth.signup.email]] (it is also your sign-in identifier), choose a password of at least 8 characters and confirm it, then click [[auth.signup.submit]].",
          result: "Your workshop is created and you land directly in the application.",
        },
        connexion: {
          text: "Next time, open the sign-in page, enter your [[login.identifiant]] (your email address) and [[login.password]], then click [[login.submit]]. If you forget it, click [[login.forgotPassword]]: a reset link is sent to the email address linked to the account.",
          result: "You arrive on your dashboard.",
        },
        courriel: {
          text: "If a banner asks you to confirm your email, open the message you received and click the link. The banner offers [[ui.emailBanner.resend]] if the message did not reach you.",
          result: "Your address is confirmed and the banner disappears.",
        },
      },
    },
    reperes: {
      title: "Finding your way around",
      intro: "The left-hand menu (computer) groups screens by area: workshop, finances, analysis and configuration.",
      steps: {
        menu: {
          text: "Click an entry in the menu, for example [[nav.orders]], to open the matching screen. The collapse button turns the menu into an icon bar to save space.",
          result: "The screen opens and its title is shown at the top of the page.",
        },
        mobile: {
          text: "On a phone, the bottom bar gives access to home, clients, models, orders and finances. The other screens (stock, production, deliveries, employees, subscription…) are in the menu opened by the button at the top left ([[nav.openMenu]]).",
          result: "Every screen stays reachable, on a computer or a phone.",
        },
        cloche: {
          text: "The bell in the header opens [[nav.notifications]]: automatic alerts (late orders, orders ready, upcoming deliveries, unpaid orders, low stock, late purchases). A red badge shows the number of unread alerts; select some then click [[notif.markSelectedRead]], or use [[notif.markRead]] on one alert.",
          result: "The badge goes down as you mark alerts as read.",
        },
        langue: {
          text: "The FR / EN button in the header changes the interface language. Your choice is saved on your account: you get it back at your next sign-in. You can also change it in [[nav.myAccount]], under [[account.language]].",
          result: "Every screen and the messages sent appear in the chosen language.",
        },
      },
    },
    clients: {
      title: "Recording your clients and their measurements",
      intro: "An order can only be created for a client who already has measurements.",
      steps: {
        liste: {
          text: "Open [[nav.clients]]. To find someone, type their last name, first name or phone in the search bar. Click [[clientes.newCliente]] to add one.",
          result: "The list shows your clients; each row leads to their record.",
        },
        creer: {
          text: "Fill in [[cli.form.lastName]], [[cli.form.firstName]] and the phone (other fields are optional), then click [[common.save]]. Add the email if you want to send them the invitation to their client space.",
          result: "The client's record opens.",
        },
        mesures: {
          text: "On the record, click [[cli.detail.newMeasure]]. Enter the measurements in centimetres (all optional), then save. Each measurement session creates a new entry: the history stays available on the record.",
          result: "The record shows the measurements; you can now create an order for this client.",
        },
      },
    },
    commandes: {
      title: "Creating and following an order",
      steps: {
        creer: {
          text: "Open [[nav.orders]] then click [[commandes.newCommande]]. Choose the [[cmd.formClient]], then the [[cmd.formModele]] if the order follows a catalogue model. Fill in the [[cmd.formTypeVetement]], the [[cmd.formPrixTotal]], the [[cmd.formPriorite]] and the [[cmd.formDateLivraison]]. To take a deposit right away, tick [[cmd.formPaiementInitial]]. Click [[cmd.formEnregistrer]].",
          result: "The order is created with the status [[cmdConst.statut.NOUVELLE]]; its record shows the price, the amount collected and the balance.",
        },
        avancer: {
          text: "Open the order from the list. In its record, the “Move to …” button advances the status: [[cmdConst.statut.NOUVELLE]], [[cmdConst.statut.EN_CONFECTION]], [[cmdConst.statut.ESSAYAGE]], [[cmdConst.statut.RETOUCHES]], then [[cmdConst.statut.TERMINEE]]. An order can also be cancelled with a mandatory reason.",
          result: "The status changes and the client signed in to their space sees the progress.",
        },
        affecter: {
          text: "Open [[nav.production]] to see who works on what. In an order's record, section [[prod.sectionTitle]], pick a person with [[prod.choisir]] then click [[prod.affecter]]. [[prod.retirer]] cancels the assignment.",
          result: "The order appears in the chosen person's jobs, and they receive an alert.",
        },
      },
    },
    paiements: {
      title: "Taking a payment and issuing a receipt",
      intro: "Payments are recorded from the order record: the Payments screen is the history.",
      steps: {
        encaisser: {
          text: "Open the order and go down to the [[cmd.sectionPaiements]] section. Enter the amount, choose the method (cash, Mobile Money, transfer…), add a reference if you have one, then click [[cmd.paieAjouter]]. Not possible on a cancelled order.",
          result: "The payment appears in the list, and the amount collected and the balance are updated.",
        },
        recu: {
          text: "In the same record, click [[recu.emettre]] next to the payment, or [[recu.emettreRecap]] for a summary receipt of the order. Find all receipts in [[nav.receipts]]: open the PDF to download or print it.",
          result: "A numbered receipt is issued; the client also finds it in their space.",
        },
        historique: {
          text: "Open [[nav.payments]] to see all payments, all orders together. Filter by method or period, or search by order, client or reference.",
          result: "You quickly find a payment.",
        },
      },
    },
    livraison: {
      title: "Delivering an order",
      steps: {
        terminer: {
          text: "Delivery is only possible when the order has the status [[cmdConst.statut.TERMINEE]]: move it to that status from its record.",
          result: "The delivery section opens in the record.",
        },
        livrer: {
          text: "In the record, section [[cmd.sectionLivraison]], add a [[cmd.livrCommentaire]] if needed. If a balance remains, tick [[cmd.livrPaiementFinal]] and enter the amount. Click [[cmd.livrEnregistrer]]. The history of all handovers is in [[nav.deliveries]].",
          result: "The order moves to [[cmdConst.statut.LIVREE]] and the delivery is dated.",
        },
      },
    },
    demandes: {
      title: "Handling order requests",
      intro: "Requests come from the client space and from the public storefront.",
      steps: {
        ouvrir: {
          text: "Open [[nav.requests]] and click a pending request to read the description, the wanted model and the contact details.",
          result: "The request detail appears with the [[demandesAdmin.sectionTraiter]] section.",
        },
        accepter: {
          text: "Accepting a request does not create the order: create it first with [[commandes.newCommande]] (see above), then, in the request, pick it with [[demandesAdmin.lierCommandeLabel]] and click [[demandesAdmin.accepterEtLier]]. If the request comes from the storefront and the person has no record yet, first click [[dvitadm.createCard]].",
          result: "The request moves to [[demStatut.ACCEPTEE]] and the client is notified.",
        },
        refuser: {
          text: "To decline, click [[demandesAdmin.refuserCetteDemande]], enter the [[demandesAdmin.motifRefusOptionnel]] if you wish, then click [[demandesAdmin.confirmerRefus]].",
          result: "The request moves to [[demStatut.REFUSEE]] with the reason, visible to the client.",
        },
        vitrine: {
          text: "To receive requests from visitors without an account, enable them in [[nav.storefront]] (see “Your public storefront”). Without follow-up, a visitor's request is deleted automatically.",
          result: "Storefront requests arrive in the same list, with a [[dvitadm.badge]] badge.",
        },
      },
    },
    stock: {
      title: "Stock, suppliers and purchases",
      steps: {
        article: {
          text: "Open [[nav.stock]] then [[stock.newArticle]]. Fill in the name, category, unit, the [[stock.seuilAlerte]] (you are alerted when the quantity drops to that level) and the [[stockMore.initialQty]].",
          result: "The item appears in the list; the initial quantity is recorded as the first movement.",
        },
        mouvement: {
          text: "In an item's record, section [[stockMore.movement]], choose [[stockMore.entry]] or [[stockMore.exit]], enter the quantity (and the [[stockMore.reason]], mandatory for an exit), then click [[stockMore.recordEntry]] or [[stockMore.recordExit]].",
          result: "The stock quantity is updated and the movement is added to the history with its author.",
        },
        fournisseur: {
          text: "Open [[nav.suppliers]] then [[fou.new]] to record where you buy fabrics and supplies.",
          result: "The supplier is available when creating a purchase.",
        },
        achat: {
          text: "Open [[nav.purchases]] then [[ach.new]]. Choose the supplier, the [[ach.dateAttendue]], add each item with [[ach.ajouterLigne]] (quantity and unit price), then click [[ach.create]].",
          result: "The purchase is recorded as [[ach.reception.AUCUNE]] and followed in the list.",
        },
        recevoir: {
          text: "When the goods arrive, open the purchase, enter the quantity received in [[ach.recevoirMaintenant]] (or click [[ach.toutRecevoir]]) then [[ach.reception.valider]].",
          result: "Stock increases automatically; the purchase becomes [[ach.reception.PARTIELLE]] or [[ach.reception.COMPLETE]].",
        },
        payer: {
          text: "To pay the purchase, click [[ach.payer]] then confirm with [[ach.payerOui]]. [[ach.annuler]] is possible as long as nothing is received or paid.",
          result: "A “Supplier purchases” expense of the same amount is created automatically.",
        },
      },
    },
    argent: {
      title: "Expenses, reports and calendar",
      steps: {
        depense: {
          text: "Open [[nav.expenses]] then [[dep.newDepense]]. Fill in the [[dep.formCategorie]], the [[dep.formMontant]] and, if needed, the [[dep.formDate]] (today otherwise) and a [[dep.formDescription]], then save.",
          result: "The expense appears in the list and in the cash result.",
        },
        finances: {
          text: "Open [[nav.reports]] to follow your finances: choose the [[ui.period.label]], then read [[rapports.encaisse]], [[rapports.depenses]] and [[rapports.soldeTresorerie]]. This is not an accounting profit: it is money collected minus expenses.",
          result: "The figures follow the chosen period.",
        },
        calendrier: {
          text: "Open [[nav.calendar]]: orders are placed on their planned delivery date. Click a day to see its orders or create one.",
          result: "You see the busy days at a glance.",
        },
      },
    },
    employes: {
      title: "Creating and managing your employees",
      intro: "Only the owner manages employees, settings and the subscription: these rights cannot be delegated.",
      steps: {
        liste: {
          text: "Open [[nav.employees]]. The list shows everyone's role, status and number of rights. Click [[emp.new]] to add someone.",
          result: "The creation form opens.",
        },
        identite: {
          text: "In [[emp.sectionIdentity]], fill in [[emp.firstName]], [[emp.lastName]], a [[emp.identifiant]] (3 characters minimum, unique on the platform) and an [[emp.password]] (8 characters minimum). Give both to the employee: they can change their password in [[nav.myAccount]].",
          result: "The employee will be able to sign in with this identifier.",
        },
        poste: {
          text: "In [[emp.sectionPoste]], choose a role (tailor, receptionist, storekeeper, accountant, other) then click [[emp.applyPoste]]: this ticks the usual rights of the role. The role is a starting template: it gives no right by itself.",
          result: "The role's rights are ticked; you can adjust them.",
        },
        droits: {
          text: "In [[emp.sectionPermissions]], tick only what the employee needs: writing includes reading. Rights that give access to money are marked [[emp.sensitive]]: when you grant them, the application asks you to enter [[emp.confirmPassword]].",
          result: "The employee will only see the screens matching the ticked rights.",
        },
        creer: {
          text: "Click [[emp.create]].",
          result: "The message [[emp.created]] appears and the employee can sign in.",
        },
        gerer: {
          text: "To edit an employee, click [[emp.manage]] on their row. Changing the role does not remove rights already granted: check them. [[emp.resetPassword]] closes their open sessions; [[emp.deactivate]] prevents them from signing in without deleting anything, and [[emp.reactivate]] reverses that.",
          result: "Changes are immediate: a deactivated employee is signed out.",
        },
      },
    },
    invitation: {
      title: "Giving a client access (client space)",
      steps: {
        inviter: {
          text: "Open the client's record and click [[clientes.inviter.inviterCeClient]], then [[clientes.inviter.confirmerInvitation]]. If the record has an email, the invitation link is sent to it; otherwise the application shows the link: click [[clientes.inviter.copier]] and pass it on yourself (WhatsApp, SMS…).",
          result: "A client account is created; the record shows “Active client account” once the account is activated.",
        },
        delai: {
          text: "The invitation link is personal, single-use and valid for 7 days. After that, or if the client lost it, renew the invitation from their record.",
          result: "The client chooses their password and signs in to their space with their phone number.",
        },
        effacement: {
          text: "A client can close their account and ask for their personal data to be erased. The record then shows [[anon.demandee]]: click [[anon.bouton]] then [[anon.confirmer]]. Their identity (name, phone, measurements…) is permanently erased; orders and payments remain in your accounts, without their identity.",
          result: "The record is anonymised; this action cannot be undone.",
        },
      },
    },
    vitrine: {
      title: "Your public storefront",
      intro: "A page open to everyone, without an account, that presents your published models. It is disabled by default.",
      steps: {
        publier: {
          text: "In a model's record, add photos, then click [[look.publish]]. Only published models are shown: never prices or client data.",
          result: "The model shows [[look.published]].",
        },
        activer: {
          text: "Open [[nav.storefront]], tick [[vitadm.active]], choose the [[vitadm.slug]] (lowercase letters, digits and hyphens), write the [[vitadm.description]] and, if you wish, tick [[vitadm.contact]] and [[dvitadm.settingLabel]]. Save.",
          result: "The message [[vitadm.saved]] appears and the storefront is online.",
        },
        partager: {
          text: "Click [[vitadm.copy]] to copy the address, or [[vitadm.open]] to visit it. Changing the address invalidates the old link.",
          result: "You can share the address with your clients.",
        },
      },
    },
    abonnement: {
      title: "Your subscription",
      intro: "The free trial lasts 15 days. After that, access continues with a subscription paid outside the application and checked by the platform.",
      steps: {
        etat: {
          text: "Open [[nav.subscription]]. [[sub.currentStatus]] shows your situation (free trial, active, expired…), the plan, the expiry and the days left. Available plans and their monthly and yearly prices are listed below, with a FAQ.",
          result: "You know until when your access is secured.",
        },
        souscrire: {
          text: "Above the list of plans, choose the period [[sub.periodMonthly]] or [[sub.periodYearly]], then click [[subPay.subscribe]] on the wanted plan. Read [[subPay.howToPay]]: these are the platform's instructions (mobile payment number, account…). Make the payment outside the application.",
          result: "You have paid and keep the transaction reference.",
        },
        declarer: {
          text: "Back on the page, choose the [[subPay.method]], the [[subPay.operator]] if requested, enter the [[subPay.reference]] (transaction number from the SMS or statement, 3 characters minimum) then click [[subPay.submit]].",
          result: "The message [[subPay.declared]] appears. No extra access is granted before the check.",
        },
        attente: {
          text: "Until the platform has checked, the payment stays [[subPay.txStatus.EN_ATTENTE]] and you cannot declare another; [[subPay.withdraw]] cancels the declaration. Once [[subPay.txStatus.REUSSIE]], the subscription is activated, you receive an email and can open the receipt with [[subPay.invoice]]. A [[subPay.txStatus.ECHOUEE]] payment shows its reason.",
          result: "The subscription starts now, or at the end of the current one if you renew early: no day is lost.",
        },
        fin: {
          text: "When the trial or subscription ends, you keep full access for a few grace days (warning banner), then the workshop becomes read-only: you view and export your data but cannot create new data. Nothing is deleted. A new subscription restores access. For any question, click [[sub.contactButton]].",
          result: "Your data stays intact, whatever the subscription situation.",
        },
      },
    },
    compte: {
      title: "Workshop settings and password",
      steps: {
        parametres: {
          text: "Open [[nav.settings]]: edit the workshop's [[param.workshopName]], [[param.currency]], [[param.slogan]] and [[param.logo]]. The [[param.receiptsTitle]] section lets you add “Key: Value” lines (mobile payment number, bank details, legal notices…) that appear on every PDF receipt. Also choose the light or dark [[param.theme]].",
          result: "The message [[param.saved]] appears and future receipts reflect the changes.",
        },
        motdepasse: {
          text: "Open [[nav.myAccount]]. Choose the [[account.language]]; to change your password, enter [[account.currentPassword]], the new password and its confirmation.",
          result: "The message [[account.passwordChanged]] appears.",
        },
      },
    },
  },
};
