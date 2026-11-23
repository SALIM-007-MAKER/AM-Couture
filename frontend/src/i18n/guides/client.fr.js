// Guide du client — français.
export default {
  title: "Guide de la cliente et du client",
  subtitle: "Pour suivre vos commandes, vos mesures et vos paiements chez votre atelier, sans avoir à téléphoner.",
  intro:
    "Votre atelier vous donne accès à un espace personnel. Vous n'y voyez que vos propres informations. Vous ne pouvez pas les modifier vous-même (pour cela, contactez l'atelier), mais vous pouvez envoyer des demandes de commande, télécharger vos reçus et gérer vos données personnelles. Les mots entre guillemets sont les libellés exacts de l'application.",
  sections: {
    activer: {
      title: "Activer votre compte et vous connecter",
      steps: {
        invitation: {
          text: "Votre atelier vous envoie un lien d'invitation par email, ou vous le transmet directement (WhatsApp, SMS…). Ouvrez-le, choisissez un [[activation.password]] d'au moins 8 caractères, confirmez-le avec [[activation.confirmPassword]], puis cliquez sur [[activation.submit]]. Le lien est personnel, ne sert qu'une fois et est valable 7 jours : s'il a expiré ou s'il est perdu, demandez-en un nouveau à l'atelier.",
          result: "Le message [[activation.success]] s'affiche et vous arrivez dans votre espace.",
        },
        connexion: {
          text: "Les fois suivantes, ouvrez la page de connexion et cliquez sur [[login.clientToggleAction]]. Saisissez votre [[login.clientIdentifiant]] (celui que l'atelier a enregistré sur votre fiche) et votre mot de passe, puis cliquez sur [[login.submit]].",
          result: "Vous arrivez dans votre espace client.",
        },
        oubli: {
          text: "Si vous avez oublié votre mot de passe, cliquez sur [[login.forgotPassword]] sur la page de connexion, saisissez votre identifiant puis cliquez sur [[auth.forgot.send]]. Un lien de réinitialisation est envoyé si un email est associé à votre compte ; sinon, demandez à l'atelier de vous réinviter.",
          result: "Vous recevez un lien pour choisir un nouveau mot de passe.",
        },
      },
    },
    reperes: {
      title: "Vous repérer",
      steps: {
        menu: {
          text: "Sur ordinateur, les onglets du haut donnent accès à vos écrans : [[nav.profile]], [[nav.orders]], [[nav.measurements]], [[nav.payments]], [[nav.requests]] et [[nav.receipts]]. Cliquez sur un onglet pour l'ouvrir.",
          result: "L'écran choisi s'affiche.",
        },
        mobile: {
          text: "Sur téléphone, la barre du bas donne accès au profil, aux commandes, aux mesures, aux paiements et aux demandes. Vos reçus sont dans le menu ouvert par le bouton en haut à gauche ([[nav.openMenu]]).",
          result: "Tous vos écrans sont accessibles depuis le téléphone.",
        },
        cloche: {
          text: "La cloche en haut à droite ouvre [[nav.notifications]] : ce qui se passe entre vous et votre atelier (commande enregistrée, changement de statut, paiement, livraison, reçu, réponse à une demande). Une pastille rouge indique le nombre de nouveautés. Cliquez sur [[client.marquerLu]] pour marquer une notification comme lue.",
          result: "La pastille diminue à mesure que vous lisez.",
        },
        profil: {
          text: "[[nav.profile]] affiche les informations que votre atelier a enregistrées sur vous (téléphone, email, adresse). Elles ne se modifient pas ici : pour toute correction, contactez directement l'atelier.",
          result: "Vous vérifiez que vos coordonnées sont à jour.",
        },
      },
    },
    commandes: {
      title: "Suivre vos commandes et vos mesures",
      steps: {
        liste: {
          text: "Ouvrez [[nav.orders]] : chaque commande indique son statut, sa date de livraison prévue et ce qu'il reste à payer.",
          result: "Vous voyez toutes vos commandes chez l'atelier.",
        },
        detail: {
          text: "Cliquez sur une commande. La fiche affiche les [[client.sectionDetails]], les [[client.sectionFinances]] ([[client.prixTotal]], [[client.paye]], [[client.resteAPayer]]), la liste de vos paiements et vos livraisons.",
          result: "Vous savez où en est votre commande et combien il reste à payer.",
        },
        etapes: {
          text: "En haut de la fiche, [[etapes.titre]] montre l'étape actuelle : [[cmdConst.statut.NOUVELLE]], [[cmdConst.statut.EN_CONFECTION]], [[cmdConst.statut.ESSAYAGE]], [[cmdConst.statut.RETOUCHES]], [[cmdConst.statut.TERMINEE]] (prête à être récupérée) puis [[cmdConst.statut.LIVREE]]. Vous êtes aussi prévenu à chaque changement par une notification.",
          result: "Quand la commande est terminée, vous pouvez venir la récupérer.",
        },
        mesures: {
          text: "Ouvrez [[nav.measurements]] pour consulter l'historique des mesures prises par votre atelier. Elles sont enregistrées par l'atelier, pas par vous.",
          result: "Vous retrouvez vos mesures à tout moment.",
        },
      },
    },
    paiements: {
      title: "Paiements et reçus",
      steps: {
        voir: {
          text: "Ouvrez [[nav.payments]] pour voir l'historique de vos encaissements, toutes commandes confondues.",
          result: "Vous retrouvez chaque paiement enregistré par l'atelier.",
        },
        recus: {
          text: "Ouvrez [[nav.receipts]] pour retrouver les documents émis pour vos paiements et commandes, et télécharger leur PDF.",
          result: "Vous conservez une preuve de chaque paiement.",
        },
        generer: {
          text: "Dans la fiche d'une commande, cliquez sur [[client.genererRecu]] pour obtenir un reçu récapitulatif, puis sur [[client.telecharger]] pour l'ouvrir.",
          result: "Le message « Reçu … généré » s'affiche et le reçu est dans [[nav.receipts]].",
        },
        regler: {
          text: "Les paiements ne se font pas dans l'application : réglez l'atelier directement (espèces, mobile money…). C'est l'atelier qui enregistre le paiement ; vous recevez alors une notification et le montant restant se met à jour.",
          result: "Votre paiement apparaît dans [[nav.payments]] dès que l'atelier l'a enregistré.",
        },
      },
    },
    demandes: {
      title: "Demander un nouveau vêtement",
      steps: {
        ouvrir: {
          text: "Ouvrez [[nav.requests]] puis cliquez sur [[client.nouvelleDemande]].",
          result: "Le formulaire de demande s'ouvre.",
        },
        ecrire: {
          text: "Décrivez ce que vous voulez dans le champ de description : type de vêtement, tissu, occasion, délai souhaité. Cliquez sur [[client.envoyerDemande]].",
          result: "La demande est envoyée à l'atelier, qui vous recontactera ; elle apparaît dans [[nav.requests]] avec le statut [[demStatut.EN_ATTENTE]].",
        },
        suivre: {
          text: "Quand l'atelier traite votre demande, son statut devient [[demStatut.ACCEPTEE]] (un lien vous mène à la commande) ou [[demStatut.REFUSEE]] (le motif est affiché). Vous êtes prévenu par une notification.",
          result: "Vous connaissez la suite donnée à votre demande.",
        },
      },
    },
    notifications: {
      title: "Vos notifications",
      steps: {
        lire: {
          text: "Ouvrez la cloche : chaque ligne indique un événement (par exemple [[notificationsClient.PAIEMENT_ENREGISTRE]] ou [[notificationsClient.RECU_EMIS]]). Cliquez sur [[client.marquerLu]] pour la marquer comme lue.",
          result: "Votre fil d'activité est à jour.",
        },
      },
    },
    donnees: {
      title: "Vos données personnelles",
      intro: "Vous gardez la main sur ce que l'atelier détient à votre sujet.",
      steps: {
        ouvrir: {
          text: "Dans [[nav.profile]], descendez jusqu'à la rubrique [[mesdonnees.titre]].",
          result: "Vous voyez les deux actions : télécharger vos données et supprimer votre compte.",
        },
        exporter: {
          text: "Cliquez sur [[mesdonnees.exporter]] : vous obtenez un fichier avec tout ce que l'atelier détient sur vous (profil, mesures, commandes, paiements, reçus et demandes).",
          result: "Le fichier est téléchargé sur votre appareil.",
        },
        supprimer: {
          text: "Pour fermer votre compte, cliquez sur [[mesdonnees.supprimer]], saisissez [[mesdonnees.motDePasse]] puis cliquez sur [[mesdonnees.confirmer]]. Votre accès est fermé immédiatement et l'atelier est chargé d'effacer vos données personnelles (nom, téléphone, adresse, mesures). Vos commandes et paiements passés restent dans la comptabilité de l'atelier, sans votre identité. Pour retrouver un accès, l'atelier devra vous inviter de nouveau.",
          result: "Vous êtes déconnecté et ne pouvez plus vous connecter avec ce compte ; cette action est définitive.",
        },
      },
    },
    langue: {
      title: "Langue de l'espace client",
      steps: {
        choisir: {
          text: "La page de connexion propose un bouton FR / EN. Si vous choisissez l'anglais avant de vous connecter, votre espace s'affiche en anglais, mais seulement jusqu'au prochain rechargement de la page : dans l'espace client il n'y a pas de sélecteur de langue, et c'est la langue de votre compte, le français, qui s'applique ensuite. Pour une autre langue de compte, demandez-le à votre atelier.",
          result: "Vous savez que votre espace s'affiche en français, sauf pendant la session où vous avez choisi l'anglais à la connexion.",
        },
      },
    },
  },
};
