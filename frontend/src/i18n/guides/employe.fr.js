// Guide de l'employé — français. Seules les sections et étapes qui correspondent aux droits du compte sont affichées.
export default {
  title: "Guide de l'employé",
  subtitle: "Pour les membres de l'équipe d'un atelier : couturier, réceptionniste, magasinier, comptable ou autre poste.",
  intro:
    "Votre responsable (le PDG) vous a créé un compte avec un identifiant et un mot de passe. Ce guide ne montre que ce que vos droits vous permettent de faire : si un écran n'apparaît pas dans votre menu, c'est que votre compte n'y a pas accès. Les mots entre guillemets sont les libellés exacts de l'application.",
  sections: {
    bienvenue: {
      title: "Bien commencer",
      steps: {
        accueil: {
          text: "Ouvrez la page de connexion, saisissez l'identifiant et le mot de passe donnés par votre responsable, puis cliquez sur [[login.submit]]. Vous arrivez sur votre accueil, l'espace de travail de votre poste. Le menu ne propose que les écrans auxquels vous avez droit.",
          result: "Votre accueil s'affiche avec les informations utiles à votre travail.",
        },
        droits: {
          text: "Vos droits sont réglés individuellement par le PDG : deux personnes au même poste peuvent donc voir des écrans différents. Si vous avez besoin d'un écran absent de votre menu, demandez-le à votre responsable. En cas de message de refus d'accès, c'est aussi une question de droits.",
          result: "Vous savez à qui vous adresser quand il vous manque un accès.",
        },
        cloche: {
          text: "La cloche de l'en-tête ouvre [[nav.notifications]] : ce sont des alertes automatiques qui vous concernent. Une pastille rouge indique les alertes non lues ; sélectionnez-en puis cliquez sur [[notif.markSelectedRead]], ou utilisez [[notif.markRead]] sur une alerte.",
          result: "La pastille diminue à mesure que vous lisez vos alertes.",
        },
        compte: {
          text: "Ouvrez [[nav.myAccount]] : choisissez la [[account.language]] et, pour changer de mot de passe, saisissez [[account.currentPassword]], le nouveau mot de passe et sa confirmation. Le bouton FR / EN de l'en-tête change aussi la langue ; elle est enregistrée sur votre compte.",
          result: "Le message [[account.passwordChanged]] s'affiche après un changement de mot de passe.",
        },
        lectureSeule: {
          text: "Si l'abonnement de l'atelier est terminé, un bandeau s'affiche et l'atelier passe en lecture seule : vous pouvez tout consulter, mais plus rien enregistrer. Prévenez votre responsable ; aucune donnée n'est perdue.",
          result: "Dès que l'abonnement est renouvelé, vous retrouvez toutes vos possibilités.",
        },
      },
    },
    couturier: {
      title: "Couturier : vos commandes à confectionner",
      intro: "Votre accueil liste les commandes qui vous sont confiées, de l'échéance la plus proche à la plus lointaine.",
      steps: {
        travaux: {
          text: "Sur l'accueil, repérez la section [[accueil.sections.mesTravaux.titre]]. Les commandes en retard portent la mention [[accueil.sections.mesTravaux.enRetard]]. Cliquez sur une commande pour l'ouvrir.",
          result: "La fiche de la commande s'ouvre.",
        },
        ouvrir: {
          text: "Pour voir toutes les commandes, ouvrez [[nav.orders]] : filtrez par statut ou par priorité, ou cherchez par numéro ou par client. Dans la fiche, lisez le modèle, le tissu, la couleur, la description et la [[cmd.fieldLivraisonPrevue]].",
          result: "Vous avez tout ce qu'il faut pour confectionner le vêtement.",
        },
        mesures: {
          text: "Dans la fiche de la commande, la section [[cmd.sectionMesures]] affiche les mesures de la cliente ; [[cmd.historiqueComplet]] ouvre toutes ses prises de mesures.",
          result: "Vous avez les mesures sous les yeux.",
        },
        statut: {
          text: "Quand vous avancez dans le travail, cliquez sur le bouton « Passer à … » de la fiche : [[cmdConst.statut.EN_CONFECTION]] quand vous commencez, [[cmdConst.statut.ESSAYAGE]] quand la cliente doit essayer, [[cmdConst.statut.RETOUCHES]] s'il y a des corrections, puis [[cmdConst.statut.TERMINEE]] quand le vêtement est prêt.",
          result: "Le statut change ; la réception voit la commande prête à livrer et la cliente suit l'avancement.",
        },
      },
    },
    reception: {
      title: "Réceptionniste : clientes et commandes",
      intro: "Votre accueil montre les demandes à traiter, les commandes prêtes à livrer et celles en retard.",
      steps: {
        accueil: {
          text: "Sur l'accueil, consultez [[accueil.sections.demandesAttente.titre]], [[accueil.sections.commandesALivrer.titre]] et [[accueil.sections.commandesEnRetard.titre]]. [[accueil.voirTout]] ouvre la liste complète.",
          result: "Vous savez ce qui demande votre attention aujourd'hui.",
        },
        cliente: {
          text: "Ouvrez [[nav.clients]] puis [[clientes.newCliente]]. Renseignez [[cli.form.lastName]], [[cli.form.firstName]] et le téléphone, puis cliquez sur [[common.save]].",
          result: "La fiche de la cliente s'ouvre.",
        },
        mesures: {
          text: "Sur la fiche, cliquez sur [[cli.detail.newMeasure]], saisissez les mesures en centimètres (toutes facultatives) et enregistrez. Sans mesures, la commande ne peut pas être créée.",
          result: "Les mesures figurent sur la fiche.",
        },
        commande: {
          text: "Ouvrez [[nav.orders]] puis [[commandes.newCommande]]. Choisissez le [[cmd.formClient]], renseignez le [[cmd.formTypeVetement]], la [[cmd.formDateLivraison]] et les détails utiles, puis cliquez sur [[cmd.formEnregistrer]].",
          result: "La commande est créée au statut [[cmdConst.statut.NOUVELLE]]. L'encaissement relève de la personne qui a le droit d'enregistrer les paiements.",
        },
      },
    },
    demandes: {
      title: "Réceptionniste : demandes de commande",
      steps: {
        ouvrir: {
          text: "Ouvrez [[nav.requests]] et cliquez sur une demande en attente pour lire la description et les coordonnées.",
          result: "Le détail s'affiche avec la section [[demandesAdmin.sectionTraiter]].",
        },
        accepter: {
          text: "Accepter une demande ne crée pas la commande : créez-la d'abord par [[commandes.newCommande]], puis, dans la demande, choisissez-la avec [[demandesAdmin.lierCommandeLabel]] et cliquez sur [[demandesAdmin.accepterEtLier]].",
          result: "La demande passe à [[demStatut.ACCEPTEE]] et la cliente est prévenue.",
        },
        refuser: {
          text: "Pour décliner, cliquez sur [[demandesAdmin.refuserCetteDemande]], indiquez le [[demandesAdmin.motifRefusOptionnel]] si vous le souhaitez, puis [[demandesAdmin.confirmerRefus]].",
          result: "La demande passe à [[demStatut.REFUSEE]] avec le motif.",
        },
      },
    },
    livraisons: {
      title: "Réceptionniste : remettre une commande",
      steps: {
        pretes: {
          text: "Les commandes terminées en attente de remise sont sur l'accueil, dans [[accueil.sections.commandesALivrer.titre]]. L'historique des remises est dans [[nav.deliveries]].",
          result: "Vous retrouvez les commandes à remettre.",
        },
        livrer: {
          text: "Ouvrez la commande : la livraison n'est possible qu'au statut [[cmdConst.statut.TERMINEE]]. Dans la section [[cmd.sectionLivraison]], ajoutez un [[cmd.livrCommentaire]] si besoin, puis cliquez sur [[cmd.livrEnregistrer]]. Si un solde reste dû, la personne autorisée à encaisser enregistre le paiement.",
          result: "La commande passe à [[cmdConst.statut.LIVREE]] et la remise est datée.",
        },
      },
    },
    magasinier: {
      title: "Magasinier : stock, fournisseurs et réceptions",
      intro: "Votre accueil montre le stock sous le seuil et les marchandises attendues. Les prix sont masqués sauf droit spécial.",
      steps: {
        alertes: {
          text: "Sur l'accueil, la section [[accueil.sections.alertesStock.titre]] liste les articles à réapprovisionner. Cliquez sur un article pour voir sa fiche.",
          result: "Vous savez quoi commander en priorité.",
        },
        article: {
          text: "Ouvrez [[nav.stock]] puis [[stock.newArticle]]. Renseignez le nom, la catégorie, l'unité, le [[stock.seuilAlerte]] et la [[stockMore.initialQty]], puis enregistrez.",
          result: "L'article apparaît dans la liste.",
        },
        mouvement: {
          text: "Dans la fiche d'un article, section [[stockMore.movement]], choisissez [[stockMore.entry]] ou [[stockMore.exit]], saisissez la quantité (et le [[stockMore.reason]], obligatoire pour une sortie), puis cliquez sur [[stockMore.recordEntry]] ou [[stockMore.recordExit]].",
          result: "La quantité est mise à jour et le mouvement est ajouté à l'historique, avec votre nom.",
        },
        fournisseurs: {
          text: "Ouvrez [[nav.suppliers]] puis [[fou.new]] pour ajouter un fournisseur (nom, contact, téléphone).",
          result: "Le fournisseur est enregistré.",
        },
        recevoir: {
          text: "À l'arrivée d'une marchandise, ouvrez [[nav.purchases]], ouvrez l'achat concerné, saisissez la quantité dans [[ach.recevoirMaintenant]] (ou cliquez sur [[ach.toutRecevoir]]) puis sur [[ach.reception.valider]].",
          result: "Le stock augmente automatiquement et l'achat passe à [[ach.reception.PARTIELLE]] ou [[ach.reception.COMPLETE]].",
        },
      },
    },
    comptable: {
      title: "Comptable : paiements, dépenses et rapports",
      intro: "Votre accueil montre les indicateurs du mois, les derniers paiements et les dernières dépenses.",
      steps: {
        accueil: {
          text: "Sur l'accueil, consultez [[accueil.sections.paiementsRecents.titre]] et [[accueil.sections.depensesRecentes.titre]].",
          result: "Vous voyez l'activité financière récente.",
        },
        encaisser: {
          text: "Ouvrez la commande concernée, section [[cmd.sectionPaiements]]. Saisissez le montant, le mode, une référence si vous en avez une, puis cliquez sur [[cmd.paieAjouter]]. Impossible sur une commande annulée.",
          result: "Le paiement apparaît, et l'encaissé et le reste à payer sont mis à jour.",
        },
        recus: {
          text: "Ouvrez [[nav.receipts]] pour retrouver les reçus émis et ouvrir leur PDF. Dans la fiche d'une commande, [[recu.emettre]] émet le reçu d'un paiement.",
          result: "Un reçu numéroté est disponible pour la cliente.",
        },
        depense: {
          text: "Ouvrez [[nav.expenses]] puis [[dep.newDepense]]. Renseignez la [[dep.formCategorie]], le [[dep.formMontant]], la date et une description, puis enregistrez.",
          result: "La dépense apparaît dans la liste et dans le résultat de trésorerie.",
        },
        rapports: {
          text: "Ouvrez [[nav.reports]], choisissez la [[ui.period.label]] puis lisez [[rapports.encaisse]], [[rapports.depenses]] et [[rapports.soldeTresorerie]].",
          result: "Les chiffres suivent la période choisie.",
        },
      },
    },
    autre: {
      title: "Poste « Autre »",
      steps: {
        general: {
          text: "Votre compte ne donne d'abord accès qu'aux notifications. Votre accueil affiche les écrans que le PDG vous a ouverts : s'il en ajoute, ils apparaissent dans votre menu et ce guide s'enrichit des sections correspondantes.",
          result: "Vous voyez uniquement ce qui vous a été accordé.",
        },
      },
    },
  },
};
