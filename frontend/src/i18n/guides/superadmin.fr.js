// Guide du SUPERADMIN (administrateur de la plateforme) — français.
export default {
  title: "Guide de l'administrateur de la plateforme",
  subtitle: "Pour le SUPERADMIN : suivre les ateliers, valider les paiements d'abonnement et fixer les formules.",
  intro:
    "Le SUPERADMIN exploite la plateforme Tailora : il ne travaille pas dans les données courantes d'un atelier (clientes, commandes…), sauf par une impersonation tracée. Les mots entre guillemets sont les libellés exacts de l'application.",
  sections: {
    reperes: {
      title: "Vous repérer",
      steps: {
        connexion: {
          text: "Ouvrez la page de connexion, saisissez votre [[login.identifiant]] et votre [[login.password]], puis cliquez sur [[login.submit]].",
          result: "Vous arrivez sur la [[sa.layout.overview]] de la plateforme.",
        },
        menu: {
          text: "Le menu donne accès à [[sa.layout.overview]], [[sa.layout.workshops]], [[sa.layout.commerce]], [[sa.layout.subscriptions]], [[sa.layout.payments]], [[sa.layout.pricing]] et [[nav.myAccount]]. Sur téléphone, ces écrans sont dans la barre du bas. Le bouton en forme de livre de l'en-tête ouvre ce guide ; la cloche ouvre les notifications.",
          result: "L'écran choisi s'affiche, son titre est rappelé dans l'en-tête.",
        },
        indicateurs: {
          text: "Sur la [[sa.layout.overview]], les totaux de la plateforme (ateliers, comptes, clientes, commandes), les tendances des six derniers mois et la section [[sa.dashboard.alerts]] (abonnements expirés ou qui expirent bientôt, ateliers suspendus, nouveaux ateliers).",
          result: "Vous repérez en un coup d'œil ce qui demande une action.",
        },
      },
    },
    notifications: {
      title: "La cloche de notifications",
      steps: {
        cloche: {
          text: "Cliquez sur la cloche de l'en-tête : la page [[sa.notifications.title]] liste les [[sa.notifications.paymentsTitle]] (paiements déclarés par les ateliers en attente de décision) et les [[sa.notifications.alertsTitle]]. Cliquez sur un paiement pour aller le traiter.",
          result: "Vous voyez ce qui demande votre attention sur la plateforme.",
        },
        compteur: {
          text: "La pastille rouge compte uniquement ce qui demande une action : paiements déclarés à valider, abonnements expirés ou qui expirent sous 7 jours. Les ateliers suspendus et les nouveaux ateliers sont listés sur la page mais ne comptent pas. Il n'y a pas de « lu / non lu » : une ligne disparaît dès que la situation est réglée, et le compteur se rafraîchit chaque minute.",
          result: "Quand la pastille a disparu, plus rien n'attend votre décision.",
        },
      },
    },
    paiements: {
      title: "Valider les paiements d'abonnement",
      intro: "Un atelier ne reçoit son accès qu'après votre vérification : aucun paiement n'est confirmé sur sa seule déclaration.",
      steps: {
        ouvrir: {
          text: "Ouvrez [[sa.layout.payments]]. Le filtre [[saPay.filterStatus]] permet d'isoler les paiements à vérifier. Chaque ligne indique l'atelier, la formule, le montant, le moyen, la [[saPay.colReference]] saisie par l'atelier et l'auteur de la déclaration.",
          result: "Les paiements à vérifier sont en tête de liste.",
        },
        rapprocher: {
          text: "Retrouvez la transaction sur votre relevé (mobile money, banque, caisse) : le montant et la référence doivent correspondre à la ligne.",
          result: "Vous savez si le paiement est réel.",
        },
        confirmer: {
          text: "Si tout correspond, cliquez sur [[saPay.confirm]] puis sur [[saPay.confirmYes]]. L'abonnement est activé et un justificatif numéroté (FAC-AAAA-NNNN) est émis ; l'atelier est prévenu par courriel. Une décision n'agit qu'une fois, même si elle est rejouée.",
          result: "Le message [[saPay.done]] s'affiche ; le justificatif est téléchargeable via [[saPay.invoice]].",
        },
        rejeter: {
          text: "Si le paiement est introuvable ou erroné, cliquez sur [[saPay.reject]], saisissez le motif (obligatoire) puis cliquez sur [[saPay.rejectConfirm]].",
          result: "Le paiement est rejeté, aucun accès n'est accordé, et l'atelier voit le motif.",
        },
        rembourser: {
          text: "Pour un paiement déjà confirmé, cliquez sur [[saPay.refund]], saisissez le motif (obligatoire) puis cliquez sur [[saPay.refundConfirm]]. Le remboursement est total uniquement. [[saPay.refundNote]]",
          result: "Le justificatif est marqué annulé (il est conservé) et l'abonnement est annulé.",
        },
      },
    },
    ateliers: {
      title: "Gérer les ateliers",
      steps: {
        liste: {
          text: "Ouvrez [[sa.layout.workshops]]. Recherchez un atelier par son nom ; la colonne [[sa.ateliers.colStatus]] indique s'il est actif ou suspendu.",
          result: "Vous retrouvez l'atelier voulu.",
        },
        creer: {
          text: "Cliquez sur [[sa.ateliers.newWorkshop]], renseignez le [[sa.ateliers.formName]], la devise, puis, dans [[sa.ateliers.firstAdmin]], un [[sa.ateliers.formIdentifier]] et un [[sa.ateliers.formPassword]]. Cliquez sur [[sa.ateliers.createWorkshop]] et communiquez l'identifiant et le mot de passe au propriétaire.",
          result: "L'atelier est créé ; son PDG peut se connecter avec cet identifiant.",
        },
        fiche: {
          text: "Cliquez sur [[sa.ateliers.manage]] sur une ligne. La fiche regroupe les [[sa.detail.sectionInfo]], les [[sa.detail.sectionAccounts]], l'abonnement, l'[[sa.detail.sectionActivity]] et l'[[sa.detail.sectionImpersonation]].",
          result: "Vous voyez tout ce qui concerne cet atelier.",
        },
        suspendre: {
          text: "Pour bloquer l'accès d'un atelier, cliquez sur [[sa.detail.suspend]] puis sur [[sa.detail.yesSuspend]]. Plus aucun compte de l'atelier ne peut accéder à l'application tant que vous n'avez pas cliqué sur [[sa.detail.reactivate]].",
          result: "L'atelier passe en [[sa.detail.statusSuspended]]. Rien n'est supprimé.",
        },
        motdepasse: {
          text: "Pour aider un propriétaire qui a perdu son accès, cliquez sur [[sa.detail.resetPassword]] sur son compte, puis sur [[sa.detail.generate]] (ou saisissez un mot de passe d'au moins 8 caractères) et sur [[sa.detail.confirmReset]]. Copiez-le avec [[sa.detail.copy]] et transmettez-le : il n'est plus affiché une fois la fenêtre fermée.",
          result: "Le propriétaire peut se reconnecter avec ce mot de passe.",
        },
        supprimer: {
          text: "La [[sa.detail.dangerZone]] permet de supprimer un atelier : [[sa.detail.deleteWorkshop]] puis [[sa.detail.yesDelete]]. C'est définitif et impossible dès que l'atelier contient la moindre donnée (clientes, commandes, dépenses, abonnements). Pour un atelier qui a servi, préférez [[sa.detail.suspend]].",
          result: "Seul un atelier totalement vide peut être supprimé.",
        },
      },
    },
    impersonation: {
      title: "Se connecter en tant qu'un compte d'atelier (impersonation)",
      intro: "À utiliser uniquement pour dépanner un atelier qui vous le demande : vous voyez l'application exactement comme son utilisateur.",
      steps: {
        entrer: {
          text: "Dans la fiche de l'atelier, section [[sa.detail.sectionAccounts]], cliquez sur [[sa.detail.impersonate]] sur le compte voulu, puis confirmez la question qui s'affiche.",
          result: "Vous êtes dans l'application de l'atelier, sous l'identité de ce compte.",
        },
        agir: {
          text: "Un bandeau reste affiché en haut de l'écran pour vous rappeler que vous agissez sous l'identité de ce compte (avec votre nom de SUPERADMIN). La session dure 2 heures au plus. L'atelier n'est jamais limité pendant l'impersonation, même en lecture seule : agissez avec prudence, vos actions sont faites au nom du compte.",
          result: "Vous pouvez reproduire et corriger le problème de l'atelier.",
        },
        quitter: {
          text: "Cliquez sur [[ui.impersonation.quit]] dans le bandeau.",
          result: "Vous retrouvez votre session SUPERADMIN.",
        },
        trace: {
          text: "Chaque impersonation est enregistrée : retrouvez-les dans la fiche de l'atelier, section [[sa.detail.sectionImpersonation]], et dans le journal de sécurité de la plateforme.",
          result: "Il reste une trace de qui s'est connecté, sur quel compte.",
        },
      },
    },
    abonnements: {
      title: "Abonnements des ateliers",
      steps: {
        vue: {
          text: "Ouvrez [[sa.layout.subscriptions]] : chaque atelier y est listé avec son état (essai gratuit, actif, expiré, suspendu…), sa formule et sa date d'expiration. L'activation d'un abonnement se fait depuis la fiche de l'atelier.",
          result: "Vous repérez les ateliers à relancer.",
        },
        activer: {
          text: "Dans la fiche de l'atelier, section abonnement, ouvrez [[saSub.form.title]]. Choisissez [[saSub.form.modeCatalogue]] (formule et période au prix du catalogue, figés dans l'abonnement) ou [[saSub.form.modeExceptional]] (durée et montant saisis, motif obligatoire), puis cliquez sur [[saSub.form.submit]].",
          result: "Le message [[saSub.form.done]] s'affiche et l'abonnement apparaît dans l'historique.",
        },
        actions: {
          text: "Dans la même section, [[saSub.actions.suspend]] met l'atelier en lecture seule immédiatement (motif obligatoire, réversible avec [[saSub.actions.reactivate]]), [[saSub.actions.expire]] termine l'abonnement tout de suite et [[saSub.actions.deactivate]] le désactive. Chaque action est datée, signée et journalisée dans l'historique.",
          result: "L'état de l'atelier est mis à jour et l'historique garde la trace.",
        },
      },
    },
    formules: {
      title: "Formules et tarification",
      intro: "Aucun prix n'est proposé par défaut : une formule n'est offerte aux ateliers que lorsqu'elle est active, tarifée et que ses limites sont définies.",
      steps: {
        creer: {
          text: "Ouvrez [[sa.layout.pricing]] puis cliquez sur [[saSub.plans.newPlan]]. Renseignez le nom, l'ordre d'affichage, la description et les fonctionnalités (une par ligne).",
          result: "La formule est créée.",
        },
        prix: {
          text: "Dans [[saSub.plans.pricesTitle]], saisissez le [[saSub.plans.fieldPriceMonthly]] et le [[saSub.plans.fieldPriceYearly]] en nombres entiers. Laissez un champ vide pour ne pas proposer cette période. Définissez aussi les limites de la formule (clientes, employés, commandes actives, modèles).",
          result: "Les ateliers voient les prix du catalogue ; les prix des abonnements déjà souscrits ne changent pas.",
        },
        activer: {
          text: "Cliquez sur [[saSub.plans.activate]] pour proposer la formule aux ateliers (ou [[saSub.plans.deactivate]] pour la retirer). Si l'activation est impossible (formule sans tarif ou aux limites non définies), l'application affiche les raisons juste en dessous.",
          result: "La formule apparaît (ou disparaît) dans la page Abonnement des ateliers.",
        },
        contact: {
          text: "En bas de la page, la rubrique [[saSub.contact.title]] permet de saisir le numéro (avec l'indicatif du pays) affiché aux PDG derrière le bouton « Contacter l'administrateur » ; cliquez sur [[saSub.contact.save]].",
          result: "Le message [[saSub.contact.saved]] s'affiche.",
        },
      },
    },
    reglages: {
      title: "Tableau commercial et réglages",
      steps: {
        commerce: {
          text: "Ouvrez [[sa.layout.commerce]] : [[saCom.revenueTitle]] (encaissé, remboursé, net), la conversion des essais, les renouvellements, les paiements à vérifier et les renouvellements à suivre.",
          result: "Vous suivez l'activité commerciale de la plateforme.",
        },
        grace: {
          text: "Plus bas, la rubrique [[saCom.settingsTitle]] contient les [[saCom.graceDays]] (accès complet après l'échéance, de 0 à 90 jours, avant la lecture seule) et les [[saCom.instructions]] affichées aux ateliers qui souscrivent (numéro de paiement mobile, compte bancaire…). Enregistrez vos modifications.",
          result: "Le message [[saCom.saved]] s'affiche et les ateliers voient vos instructions.",
        },
      },
    },
    compte: {
      title: "Votre compte et la langue",
      steps: {
        langue: {
          text: "Ouvrez [[nav.myAccount]]. Choisissez la [[account.language]] : elle est enregistrée sur votre compte et s'applique à l'interface et aux courriels. Pour changer votre mot de passe, saisissez [[account.currentPassword]], le nouveau mot de passe et sa confirmation. L'espace SUPERADMIN n'a pas de bouton FR / EN dans l'en-tête : la langue se règle ici.",
          result: "Le message [[account.passwordChanged]] s'affiche après un changement de mot de passe.",
        },
      },
    },
  },
};
