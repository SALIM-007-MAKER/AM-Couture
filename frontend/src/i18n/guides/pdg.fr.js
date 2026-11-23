// Guide du PDG — français. Les libellés d'écran sont écrits [[cle.i18n]] : ils sont remplacés par le libellé réel de l'interface.
export default {
  title: "Guide du PDG",
  subtitle: "Pour le propriétaire d'un atelier : de la création du compte à la gestion de l'équipe et de l'abonnement.",
  intro:
    "Vous avez tous les droits sur votre atelier. Ce guide suit l'ordre naturel : démarrer, enregistrer vos clientes, vos commandes et vos encaissements, puis organiser votre équipe. Les mots entre guillemets sont les libellés exacts de l'application.",
  sections: {
    demarrer: {
      title: "Démarrer",
      intro: "Créez votre atelier une seule fois ; vous bénéficiez de 15 jours d'essai gratuit avec accès complet.",
      steps: {
        inscription: {
          text: "Sur la page de connexion, cliquez sur [[login.createWorkshop]]. Renseignez [[auth.signup.workshopName]], [[auth.signup.firstName]], [[auth.signup.lastName]] et [[auth.signup.email]] (il sert aussi d'identifiant de connexion), choisissez un mot de passe d'au moins 8 caractères et confirmez-le, puis cliquez sur [[auth.signup.submit]].",
          result: "Votre atelier est créé et vous arrivez directement dans l'application.",
        },
        connexion: {
          text: "Les fois suivantes, ouvrez la page de connexion, saisissez [[login.identifiant]] (votre adresse email) et [[login.password]], puis cliquez sur [[login.submit]]. En cas d'oubli, cliquez sur [[login.forgotPassword]] : un lien de réinitialisation est envoyé à l'adresse email associée au compte.",
          result: "Vous arrivez sur votre tableau de bord.",
        },
        courriel: {
          text: "Si un bandeau vous demande de confirmer votre email, ouvrez le message reçu et cliquez sur le lien. Le bandeau propose [[ui.emailBanner.resend]] si le message ne vous est pas parvenu.",
          result: "Votre adresse est confirmée et le bandeau disparaît.",
        },
      },
    },
    reperes: {
      title: "Vous repérer dans l'application",
      intro: "Le menu de gauche (ordinateur) regroupe les écrans par domaine : atelier, finances, analyse et configuration.",
      steps: {
        menu: {
          text: "Cliquez sur une entrée du menu, par exemple [[nav.orders]], pour ouvrir l'écran correspondant. Le bouton de réduction en bas du menu le transforme en barre d'icônes pour gagner de la place.",
          result: "L'écran s'ouvre et son titre s'affiche en haut de la page.",
        },
        mobile: {
          text: "Sur téléphone, la barre du bas donne accès à l'accueil, aux clients, aux modèles, aux commandes et aux finances. Les autres écrans (stock, production, livraisons, employés, abonnement…) sont dans le menu ouvert par le bouton en haut à gauche ([[nav.openMenu]]).",
          result: "Tous les écrans restent accessibles, sur ordinateur comme sur téléphone.",
        },
        cloche: {
          text: "La cloche de l'en-tête ouvre [[nav.notifications]] : ce sont des alertes automatiques (commandes en retard, commandes prêtes, livraisons proches, impayés, stock bas, achats en retard). Une pastille rouge indique le nombre d'alertes non lues ; sélectionnez-en puis cliquez sur [[notif.markSelectedRead]], ou utilisez [[notif.markRead]] sur une alerte.",
          result: "La pastille diminue à mesure que vous marquez les alertes comme lues.",
        },
        langue: {
          text: "Le bouton FR / EN de l'en-tête change la langue de l'interface. Votre choix est enregistré sur votre compte : vous le retrouvez à la prochaine connexion. Vous pouvez aussi le modifier dans [[nav.myAccount]], rubrique [[account.language]].",
          result: "Tous les écrans et les messages envoyés s'affichent dans la langue choisie.",
        },
      },
    },
    clients: {
      title: "Enregistrer vos clientes et leurs mesures",
      intro: "Une commande ne peut être créée que pour une cliente qui a déjà des mesures.",
      steps: {
        liste: {
          text: "Ouvrez [[nav.clients]]. Pour retrouver quelqu'un, saisissez son nom, prénom ou téléphone dans la barre de recherche. Cliquez sur [[clientes.newCliente]] pour en ajouter un.",
          result: "La liste affiche vos clientes ; chaque ligne mène à sa fiche.",
        },
        creer: {
          text: "Renseignez [[cli.form.lastName]], [[cli.form.firstName]] et le téléphone (les autres champs sont facultatifs), puis cliquez sur [[common.save]]. Ajoutez l'email si vous voulez pouvoir lui envoyer l'invitation à son espace client.",
          result: "La fiche de la cliente s'ouvre.",
        },
        mesures: {
          text: "Sur la fiche, cliquez sur [[cli.detail.newMeasure]]. Saisissez les mesures en centimètres (toutes sont facultatives), puis enregistrez. Chaque prise de mesures crée un nouvel enregistrement : l'historique reste consultable sur la fiche.",
          result: "La fiche affiche les mesures ; vous pouvez maintenant créer une commande pour cette cliente.",
        },
      },
    },
    commandes: {
      title: "Créer et suivre une commande",
      steps: {
        creer: {
          text: "Ouvrez [[nav.orders]] puis cliquez sur [[commandes.newCommande]]. Choisissez le [[cmd.formClient]], puis le [[cmd.formModele]] si la commande suit un modèle du catalogue. Renseignez le [[cmd.formTypeVetement]], le [[cmd.formPrixTotal]], la [[cmd.formPriorite]] et la [[cmd.formDateLivraison]]. Pour encaisser un acompte tout de suite, cochez [[cmd.formPaiementInitial]]. Cliquez sur [[cmd.formEnregistrer]].",
          result: "La commande est créée au statut [[cmdConst.statut.NOUVELLE]] ; sa fiche s'affiche avec le prix, l'encaissé et le reste à payer.",
        },
        avancer: {
          text: "Ouvrez la commande depuis la liste. Dans sa fiche, le bouton « Passer à … » fait avancer le statut : [[cmdConst.statut.NOUVELLE]], [[cmdConst.statut.EN_CONFECTION]], [[cmdConst.statut.ESSAYAGE]], [[cmdConst.statut.RETOUCHES]], puis [[cmdConst.statut.TERMINEE]]. Une commande peut aussi être annulée avec un motif obligatoire.",
          result: "Le statut change et la cliente connectée à son espace voit l'avancement.",
        },
        affecter: {
          text: "Ouvrez [[nav.production]] pour savoir qui travaille sur quoi. Dans la fiche d'une commande, section [[prod.sectionTitle]], choisissez une personne avec [[prod.choisir]] puis cliquez sur [[prod.affecter]]. [[prod.retirer]] annule l'affectation.",
          result: "La commande apparaît dans les travaux de la personne choisie, et elle reçoit une alerte.",
        },
      },
    },
    paiements: {
      title: "Encaisser un paiement et émettre un reçu",
      intro: "Les paiements s'enregistrent depuis la fiche de la commande : l'écran Paiements est l'historique.",
      steps: {
        encaisser: {
          text: "Ouvrez la commande, descendez à la section [[cmd.sectionPaiements]]. Saisissez le montant, choisissez le mode (espèces, Mobile Money, virement…), ajoutez une référence si vous en avez une, puis cliquez sur [[cmd.paieAjouter]]. Impossible sur une commande annulée.",
          result: "Le paiement apparaît dans la liste, et l'encaissé et le reste à payer sont mis à jour.",
        },
        recu: {
          text: "Dans la même fiche, cliquez sur [[recu.emettre]] à côté du paiement, ou sur [[recu.emettreRecap]] pour un reçu récapitulatif de la commande. Retrouvez tous les reçus dans [[nav.receipts]] : ouvrez le PDF pour le télécharger ou l'imprimer.",
          result: "Un reçu numéroté est émis ; la cliente le retrouve aussi dans son espace.",
        },
        historique: {
          text: "Ouvrez [[nav.payments]] pour voir tous les encaissements, toutes commandes confondues. Filtrez par mode, par période ou cherchez par commande, client ou référence.",
          result: "Vous retrouvez rapidement un encaissement.",
        },
      },
    },
    livraison: {
      title: "Livrer une commande",
      steps: {
        terminer: {
          text: "La livraison n'est possible que lorsque la commande est au statut [[cmdConst.statut.TERMINEE]] : passez-la à ce statut depuis sa fiche.",
          result: "La section de livraison s'ouvre dans la fiche.",
        },
        livrer: {
          text: "Dans la fiche, section [[cmd.sectionLivraison]], ajoutez un [[cmd.livrCommentaire]] si besoin. S'il reste un solde, cochez [[cmd.livrPaiementFinal]] et saisissez le montant. Cliquez sur [[cmd.livrEnregistrer]]. L'historique de toutes les remises est dans [[nav.deliveries]].",
          result: "La commande passe à [[cmdConst.statut.LIVREE]] et la livraison est datée.",
        },
      },
    },
    demandes: {
      title: "Traiter les demandes de commande",
      intro: "Les demandes viennent de l'espace client et de la vitrine publique.",
      steps: {
        ouvrir: {
          text: "Ouvrez [[nav.requests]] et cliquez sur une demande en attente pour lire la description, le modèle souhaité et les coordonnées.",
          result: "Le détail de la demande s'affiche avec la section [[demandesAdmin.sectionTraiter]].",
        },
        accepter: {
          text: "Accepter une demande ne crée pas la commande : créez-la d'abord par [[commandes.newCommande]] (voir plus haut), puis, dans la demande, choisissez-la avec [[demandesAdmin.lierCommandeLabel]] et cliquez sur [[demandesAdmin.accepterEtLier]]. Si la demande vient de la vitrine et que la personne n'a pas encore de fiche, cliquez d'abord sur [[dvitadm.createCard]].",
          result: "La demande passe à [[demStatut.ACCEPTEE]] et la cliente est prévenue.",
        },
        refuser: {
          text: "Pour décliner, cliquez sur [[demandesAdmin.refuserCetteDemande]], indiquez si vous le souhaitez le [[demandesAdmin.motifRefusOptionnel]] puis cliquez sur [[demandesAdmin.confirmerRefus]].",
          result: "La demande passe à [[demStatut.REFUSEE]] avec le motif, visible de la cliente.",
        },
        vitrine: {
          text: "Pour recevoir des demandes de visiteurs sans compte, activez-les dans [[nav.storefront]] (voir « Votre vitrine publique »). Sans suite, une demande de visiteur est effacée automatiquement.",
          result: "Les demandes de la vitrine arrivent dans la même liste, avec un badge [[dvitadm.badge]].",
        },
      },
    },
    stock: {
      title: "Stock, fournisseurs et achats",
      steps: {
        article: {
          text: "Ouvrez [[nav.stock]] puis [[stock.newArticle]]. Renseignez le nom, la catégorie, l'unité, le [[stock.seuilAlerte]] (vous êtes alerté quand la quantité descend à ce niveau) et la [[stockMore.initialQty]].",
          result: "L'article apparaît dans la liste ; la quantité initiale est enregistrée comme premier mouvement.",
        },
        mouvement: {
          text: "Dans la fiche d'un article, section [[stockMore.movement]], choisissez [[stockMore.entry]] ou [[stockMore.exit]], saisissez la quantité (et le [[stockMore.reason]], obligatoire pour une sortie), puis cliquez sur [[stockMore.recordEntry]] ou [[stockMore.recordExit]].",
          result: "La quantité en stock est mise à jour et le mouvement est ajouté à l'historique avec son auteur.",
        },
        fournisseur: {
          text: "Ouvrez [[nav.suppliers]] puis [[fou.new]] pour enregistrer chez qui vous achetez tissus et fournitures.",
          result: "Le fournisseur est disponible lors de la création d'un achat.",
        },
        achat: {
          text: "Ouvrez [[nav.purchases]] puis [[ach.new]]. Choisissez le fournisseur, la [[ach.dateAttendue]], ajoutez chaque article avec [[ach.ajouterLigne]] (quantité et prix unitaire), puis cliquez sur [[ach.create]].",
          result: "L'achat est enregistré comme [[ach.reception.AUCUNE]] et suivi dans la liste.",
        },
        recevoir: {
          text: "À l'arrivée de la marchandise, ouvrez l'achat, saisissez dans [[ach.recevoirMaintenant]] la quantité reçue (ou cliquez sur [[ach.toutRecevoir]]) puis sur [[ach.reception.valider]].",
          result: "Le stock augmente automatiquement ; l'achat devient [[ach.reception.PARTIELLE]] ou [[ach.reception.COMPLETE]].",
        },
        payer: {
          text: "Pour régler l'achat, cliquez sur [[ach.payer]] puis confirmez avec [[ach.payerOui]]. [[ach.annuler]] est possible tant que rien n'est reçu ni payé.",
          result: "Une dépense « Achats fournisseurs » du même montant est créée automatiquement.",
        },
      },
    },
    argent: {
      title: "Dépenses, rapports et calendrier",
      steps: {
        depense: {
          text: "Ouvrez [[nav.expenses]] puis [[dep.newDepense]]. Renseignez la [[dep.formCategorie]], le [[dep.formMontant]] et, si besoin, la [[dep.formDate]] (la date du jour sinon) et une [[dep.formDescription]], puis enregistrez.",
          result: "La dépense apparaît dans la liste et dans le résultat de trésorerie.",
        },
        finances: {
          text: "Ouvrez [[nav.reports]] pour suivre vos finances : choisissez la [[ui.period.label]], puis consultez [[rapports.encaisse]], [[rapports.depenses]] et [[rapports.soldeTresorerie]]. Ce n'est pas un bénéfice comptable : c'est l'encaissé moins les dépenses.",
          result: "Les chiffres suivent la période choisie.",
        },
        calendrier: {
          text: "Ouvrez [[nav.calendar]] : les commandes y sont placées à leur date de livraison prévue. Cliquez sur un jour pour voir ses commandes ou en créer une.",
          result: "Vous voyez d'un coup d'œil les jours chargés.",
        },
      },
    },
    employes: {
      title: "Créer et gérer vos employés",
      intro: "Seul le PDG gère les employés, les paramètres et l'abonnement : ces droits ne se délèguent pas.",
      steps: {
        liste: {
          text: "Ouvrez [[nav.employees]]. La liste montre le poste, le statut et le nombre de droits de chacun. Cliquez sur [[emp.new]] pour ajouter quelqu'un.",
          result: "Le formulaire de création s'ouvre.",
        },
        identite: {
          text: "Dans [[emp.sectionIdentity]], renseignez [[emp.firstName]], [[emp.lastName]], un [[emp.identifiant]] (3 caractères minimum, unique sur la plateforme) et un [[emp.password]] (8 caractères minimum). Communiquez ces deux informations à l'employé : il pourra changer son mot de passe dans [[nav.myAccount]].",
          result: "L'employé pourra se connecter avec cet identifiant.",
        },
        poste: {
          text: "Dans [[emp.sectionPoste]], choisissez un poste (couturier, réceptionniste, magasinier, comptable, autre) puis cliquez sur [[emp.applyPoste]] : cela coche les droits habituels du poste. Le poste est un modèle de départ : il ne donne aucun droit par lui-même.",
          result: "Les droits du poste sont cochés ; vous pouvez les ajuster.",
        },
        droits: {
          text: "Dans [[emp.sectionPermissions]], cochez uniquement ce dont l'employé a besoin : l'écriture inclut la lecture. Les droits qui donnent accès à l'argent portent la mention [[emp.sensitive]] : en les accordant, l'application vous demande de saisir [[emp.confirmPassword]].",
          result: "L'employé ne verra que les écrans qui correspondent aux droits cochés.",
        },
        creer: {
          text: "Cliquez sur [[emp.create]].",
          result: "Le message [[emp.created]] s'affiche et l'employé peut se connecter.",
        },
        gerer: {
          text: "Pour modifier un employé, cliquez sur [[emp.manage]] sur sa ligne. Changer de poste ne retire pas les droits déjà accordés : vérifiez-les. [[emp.resetPassword]] ferme ses sessions ouvertes ; [[emp.deactivate]] l'empêche de se connecter sans rien supprimer, et [[emp.reactivate]] annule cette décision.",
          result: "Les changements sont immédiats : l'employé est déconnecté s'il est désactivé.",
        },
      },
    },
    invitation: {
      title: "Donner accès à une cliente (espace client)",
      steps: {
        inviter: {
          text: "Ouvrez la fiche de la cliente et cliquez sur [[clientes.inviter.inviterCeClient]], puis sur [[clientes.inviter.confirmerInvitation]]. Si la fiche contient un email, le lien d'invitation lui est envoyé ; sinon l'application affiche le lien : cliquez sur [[clientes.inviter.copier]] et transmettez-le vous-même (WhatsApp, SMS…).",
          result: "Un compte client est créé ; la fiche indique « Compte client actif » une fois le compte activé.",
        },
        delai: {
          text: "Le lien d'invitation est personnel, à usage unique et valable 7 jours. Passé ce délai, ou si la cliente l'a perdu, renouvelez l'invitation depuis sa fiche.",
          result: "La cliente choisit son mot de passe et accède à son espace avec son numéro de téléphone.",
        },
        effacement: {
          text: "Une cliente peut fermer son compte et demander l'effacement de ses données personnelles. La fiche affiche alors [[anon.demandee]] : cliquez sur [[anon.bouton]] puis [[anon.confirmer]]. Son identité (nom, téléphone, mesures…) est effacée définitivement ; les commandes et paiements restent dans votre comptabilité, sans son identité.",
          result: "La fiche est anonymisée ; cette action est irréversible.",
        },
      },
    },
    vitrine: {
      title: "Votre vitrine publique",
      intro: "Une page ouverte à tous, sans compte, qui présente vos modèles publiés. Elle est désactivée par défaut.",
      steps: {
        publier: {
          text: "Dans la fiche d'un modèle, ajoutez des photos, puis cliquez sur [[look.publish]]. Seuls les modèles publiés sont montrés : jamais de prix ni de donnée de cliente.",
          result: "Le modèle indique [[look.published]].",
        },
        activer: {
          text: "Ouvrez [[nav.storefront]], cochez [[vitadm.active]], choisissez l'[[vitadm.slug]] (lettres minuscules, chiffres et tirets), rédigez la [[vitadm.description]] et, si vous le souhaitez, cochez [[vitadm.contact]] et [[dvitadm.settingLabel]]. Enregistrez.",
          result: "Le message [[vitadm.saved]] s'affiche et la vitrine est en ligne.",
        },
        partager: {
          text: "Cliquez sur [[vitadm.copy]] pour copier l'adresse, ou sur [[vitadm.open]] pour la visiter. Changer l'adresse invalide l'ancien lien.",
          result: "Vous pouvez partager l'adresse à vos clientes.",
        },
      },
    },
    abonnement: {
      title: "Votre abonnement",
      intro: "L'essai gratuit dure 15 jours. Ensuite, l'accès se poursuit avec un abonnement payé hors de l'application et vérifié par la plateforme.",
      steps: {
        etat: {
          text: "Ouvrez [[nav.subscription]]. [[sub.currentStatus]] indique votre situation (essai gratuit, actif, expiré…), la formule, l'expiration et les jours restants. Les formules disponibles et leurs prix mensuel et annuel sont listés plus bas, avec une foire aux questions.",
          result: "Vous savez jusqu'à quand votre accès est assuré.",
        },
        souscrire: {
          text: "Au-dessus de la liste des formules, choisissez la période [[sub.periodMonthly]] ou [[sub.periodYearly]], puis cliquez sur [[subPay.subscribe]] sur la formule voulue. Lisez [[subPay.howToPay]] : ce sont les instructions de la plateforme (numéro de paiement mobile, compte…). Effectuez le paiement en dehors de l'application.",
          result: "Vous avez payé et gardez la référence de la transaction.",
        },
        declarer: {
          text: "De retour sur la page, choisissez le [[subPay.method]], l'[[subPay.operator]] si demandé, saisissez la [[subPay.reference]] (numéro de transaction du SMS ou du relevé, 3 caractères minimum) puis cliquez sur [[subPay.submit]].",
          result: "Le message [[subPay.declared]] s'affiche. Aucun accès supplémentaire n'est accordé avant la vérification.",
        },
        attente: {
          text: "Tant que la plateforme n'a pas vérifié, le paiement reste [[subPay.txStatus.EN_ATTENTE]] et vous ne pouvez pas en déclarer un autre ; [[subPay.withdraw]] annule la déclaration. Une fois [[subPay.txStatus.REUSSIE]], l'abonnement est activé, vous recevez un courriel et pouvez ouvrir le justificatif avec [[subPay.invoice]]. Un paiement [[subPay.txStatus.ECHOUEE]] affiche son motif.",
          result: "L'abonnement commence maintenant, ou à l'échéance de l'abonnement en cours si vous renouvelez avant la fin : aucun jour n'est perdu.",
        },
        fin: {
          text: "Quand l'essai ou l'abonnement se termine, vous gardez l'accès complet pendant quelques jours de grâce (bandeau d'avertissement), puis l'atelier passe en lecture seule : vous consultez et exportez vos données, sans en créer de nouvelles. Rien n'est supprimé. Un nouvel abonnement rétablit l'accès. Pour une question, cliquez sur [[sub.contactButton]].",
          result: "Vos données restent intactes, quelle que soit la situation de l'abonnement.",
        },
      },
    },
    compte: {
      title: "Paramètres de l'atelier et mot de passe",
      steps: {
        parametres: {
          text: "Ouvrez [[nav.settings]] : modifiez le [[param.workshopName]], la [[param.currency]], le [[param.slogan]] et le [[param.logo]] de l'atelier. La rubrique [[param.receiptsTitle]] permet d'ajouter des lignes « Clé : Valeur » (numéro de paiement mobile, RIB, mentions légales…) qui figureront sur chaque reçu PDF. Choisissez aussi le [[param.theme]] clair ou sombre.",
          result: "Le message [[param.saved]] s'affiche et les prochains reçus tiennent compte des changements.",
        },
        motdepasse: {
          text: "Ouvrez [[nav.myAccount]]. Choisissez la [[account.language]] ; pour changer de mot de passe, saisissez [[account.currentPassword]], le nouveau mot de passe et sa confirmation.",
          result: "Le message [[account.passwordChanged]] s'affiche.",
        },
      },
    },
  },
};
