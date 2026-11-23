// Employee guide — English. Only the sections and steps matching the account's rights are shown.
export default {
  title: "Employee guide",
  subtitle: "For members of a workshop team: tailor, receptionist, storekeeper, accountant or another role.",
  intro:
    "Your manager (the owner) created an account for you with an identifier and a password. This guide only shows what your rights allow you to do: if a screen is missing from your menu, your account has no access to it. Words in quotation marks are the exact labels used in the application.",
  sections: {
    bienvenue: {
      title: "Getting started",
      steps: {
        accueil: {
          text: "Open the sign-in page, enter the identifier and password given by your manager, then click [[login.submit]]. You land on your home page, the workspace of your role. The menu only offers the screens you are entitled to.",
          result: "Your home page shows the information useful for your work.",
        },
        droits: {
          text: "Your rights are set individually by the owner: two people with the same role may therefore see different screens. If you need a screen that is missing from your menu, ask your manager. An access-denied message is also a matter of rights.",
          result: "You know who to ask when you lack an access.",
        },
        cloche: {
          text: "The bell in the header opens [[nav.notifications]]: automatic alerts that concern you. A red badge shows unread alerts; select some then click [[notif.markSelectedRead]], or use [[notif.markRead]] on one alert.",
          result: "The badge goes down as you read your alerts.",
        },
        compte: {
          text: "Open [[nav.myAccount]]: choose the [[account.language]] and, to change your password, enter [[account.currentPassword]], the new password and its confirmation. The FR / EN button in the header also changes the language; it is saved on your account.",
          result: "The message [[account.passwordChanged]] appears after a password change.",
        },
        lectureSeule: {
          text: "If the workshop's subscription has ended, a banner appears and the workshop becomes read-only: you can view everything but save nothing. Tell your manager; no data is lost.",
          result: "As soon as the subscription is renewed, everything works again.",
        },
      },
    },
    couturier: {
      title: "Tailor: your orders to make",
      intro: "Your home page lists the orders assigned to you, from the nearest deadline to the furthest.",
      steps: {
        travaux: {
          text: "On the home page, find the [[accueil.sections.mesTravaux.titre]] section. Late orders carry the mention [[accueil.sections.mesTravaux.enRetard]]. Click an order to open it.",
          result: "The order record opens.",
        },
        ouvrir: {
          text: "To see all orders, open [[nav.orders]]: filter by status or priority, or search by number or client. In the record, read the model, fabric, colour, description and the [[cmd.fieldLivraisonPrevue]].",
          result: "You have everything you need to make the garment.",
        },
        mesures: {
          text: "In the order record, the [[cmd.sectionMesures]] section shows the client's measurements; [[cmd.historiqueComplet]] opens all her measurement sessions.",
          result: "You have the measurements in front of you.",
        },
        statut: {
          text: "As work progresses, click the “Move to …” button in the record: [[cmdConst.statut.EN_CONFECTION]] when you start, [[cmdConst.statut.ESSAYAGE]] when the client must try it on, [[cmdConst.statut.RETOUCHES]] if corrections are needed, then [[cmdConst.statut.TERMINEE]] when the garment is ready.",
          result: "The status changes; reception sees the order ready for delivery and the client follows the progress.",
        },
      },
    },
    reception: {
      title: "Receptionist: clients and orders",
      intro: "Your home page shows the requests to handle, the orders ready for delivery and the late ones.",
      steps: {
        accueil: {
          text: "On the home page, read [[accueil.sections.demandesAttente.titre]], [[accueil.sections.commandesALivrer.titre]] and [[accueil.sections.commandesEnRetard.titre]]. [[accueil.voirTout]] opens the full list.",
          result: "You know what needs your attention today.",
        },
        cliente: {
          text: "Open [[nav.clients]] then [[clientes.newCliente]]. Fill in [[cli.form.lastName]], [[cli.form.firstName]] and the phone, then click [[common.save]].",
          result: "The client's record opens.",
        },
        mesures: {
          text: "On the record, click [[cli.detail.newMeasure]], enter the measurements in centimetres (all optional) and save. Without measurements, the order cannot be created.",
          result: "The measurements appear on the record.",
        },
        commande: {
          text: "Open [[nav.orders]] then [[commandes.newCommande]]. Choose the [[cmd.formClient]], fill in the [[cmd.formTypeVetement]], the [[cmd.formDateLivraison]] and any useful details, then click [[cmd.formEnregistrer]].",
          result: "The order is created with the status [[cmdConst.statut.NOUVELLE]]. Taking payment is up to the person allowed to record payments.",
        },
      },
    },
    demandes: {
      title: "Receptionist: order requests",
      steps: {
        ouvrir: {
          text: "Open [[nav.requests]] and click a pending request to read the description and contact details.",
          result: "The detail appears with the [[demandesAdmin.sectionTraiter]] section.",
        },
        accepter: {
          text: "Accepting a request does not create the order: create it first with [[commandes.newCommande]], then, in the request, pick it with [[demandesAdmin.lierCommandeLabel]] and click [[demandesAdmin.accepterEtLier]].",
          result: "The request moves to [[demStatut.ACCEPTEE]] and the client is notified.",
        },
        refuser: {
          text: "To decline, click [[demandesAdmin.refuserCetteDemande]], enter the [[demandesAdmin.motifRefusOptionnel]] if you wish, then [[demandesAdmin.confirmerRefus]].",
          result: "The request moves to [[demStatut.REFUSEE]] with the reason.",
        },
      },
    },
    livraisons: {
      title: "Receptionist: handing over an order",
      steps: {
        pretes: {
          text: "Finished orders waiting for handover are on the home page, in [[accueil.sections.commandesALivrer.titre]]. The history of handovers is in [[nav.deliveries]].",
          result: "You find the orders to hand over.",
        },
        livrer: {
          text: "Open the order: delivery is only possible with the status [[cmdConst.statut.TERMINEE]]. In the [[cmd.sectionLivraison]] section, add a [[cmd.livrCommentaire]] if needed, then click [[cmd.livrEnregistrer]]. If a balance is still due, the person allowed to take payments records it.",
          result: "The order moves to [[cmdConst.statut.LIVREE]] and the handover is dated.",
        },
      },
    },
    magasinier: {
      title: "Storekeeper: stock, suppliers and receipts",
      intro: "Your home page shows the stock under its threshold and the goods expected. Prices are hidden unless a special right is granted.",
      steps: {
        alertes: {
          text: "On the home page, the [[accueil.sections.alertesStock.titre]] section lists the items to restock. Click an item to see its record.",
          result: "You know what to order first.",
        },
        article: {
          text: "Open [[nav.stock]] then [[stock.newArticle]]. Fill in the name, category, unit, the [[stock.seuilAlerte]] and the [[stockMore.initialQty]], then save.",
          result: "The item appears in the list.",
        },
        mouvement: {
          text: "In an item's record, section [[stockMore.movement]], choose [[stockMore.entry]] or [[stockMore.exit]], enter the quantity (and the [[stockMore.reason]], mandatory for an exit), then click [[stockMore.recordEntry]] or [[stockMore.recordExit]].",
          result: "The quantity is updated and the movement is added to the history, with your name.",
        },
        fournisseurs: {
          text: "Open [[nav.suppliers]] then [[fou.new]] to add a supplier (name, contact, phone).",
          result: "The supplier is saved.",
        },
        recevoir: {
          text: "When goods arrive, open [[nav.purchases]], open the purchase concerned, enter the quantity in [[ach.recevoirMaintenant]] (or click [[ach.toutRecevoir]]) then [[ach.reception.valider]].",
          result: "Stock increases automatically and the purchase becomes [[ach.reception.PARTIELLE]] or [[ach.reception.COMPLETE]].",
        },
      },
    },
    comptable: {
      title: "Accountant: payments, expenses and reports",
      intro: "Your home page shows the month's indicators, the latest payments and the latest expenses.",
      steps: {
        accueil: {
          text: "On the home page, read [[accueil.sections.paiementsRecents.titre]] and [[accueil.sections.depensesRecentes.titre]].",
          result: "You see the recent financial activity.",
        },
        encaisser: {
          text: "Open the order concerned, section [[cmd.sectionPaiements]]. Enter the amount, the method, a reference if you have one, then click [[cmd.paieAjouter]]. Not possible on a cancelled order.",
          result: "The payment appears, and the amount collected and the balance are updated.",
        },
        recus: {
          text: "Open [[nav.receipts]] to find issued receipts and open their PDF. In an order record, [[recu.emettre]] issues the receipt of a payment.",
          result: "A numbered receipt is available for the client.",
        },
        depense: {
          text: "Open [[nav.expenses]] then [[dep.newDepense]]. Fill in the [[dep.formCategorie]], the [[dep.formMontant]], the date and a description, then save.",
          result: "The expense appears in the list and in the cash result.",
        },
        rapports: {
          text: "Open [[nav.reports]], choose the [[ui.period.label]] then read [[rapports.encaisse]], [[rapports.depenses]] and [[rapports.soldeTresorerie]].",
          result: "The figures follow the chosen period.",
        },
      },
    },
    autre: {
      title: "“Other” role",
      steps: {
        general: {
          text: "Your account first only gives access to notifications. Your home page shows the screens the owner opened for you: if more are added, they appear in your menu and this guide gains the matching sections.",
          result: "You only see what has been granted to you.",
        },
      },
    },
  },
};
