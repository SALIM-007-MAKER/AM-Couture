// Structure des guides d'utilisation : QUOI est expliqué, OÙ et POUR QUI. Les textes (français / anglais) sont dans
// i18n/guides/<guide>.<langue>.js, rangés par les mêmes identifiants ; les libellés de l'interface y sont écrits
// « [[cle.i18n]] » et remplacés au rendu par le libellé RÉEL de la langue affichée (jamais recopié à la main).
//
// Garde-fous (voir __tests__/guide.test.js) : chaque clé citée existe, chaque page `to` est une vraie route, chaque
// permission existe dans le catalogue du serveur, FR et EN ont exactement les mêmes sections et étapes.
//
// Section : { id, permissions?, espace?, shot?, steps }
//   permissions : l'employé doit TOUTES les avoir pour que la section lui soit montrée (le PDG a tout). Pour une section de
//                 poste, ce sont les droits qui la distinguent (un couturier a « stock.lire » mais pas « stock.ecrire »).
//   espace      : poste dont c'est la section propre (elle passe en premier pour ce poste).
//   shot        : { id, to, pleinePage? } capture d'écran de la page `to` (voir e2e/specs/guide-captures.spec.js) ;
//                 `pleinePage` : la fenêtre est agrandie à la hauteur de la page (formulaire long dont toutes les étapes sont annotées).
// Étape : { id, to?, ui?, permissions?, cible? }
//   to      : page où l'étape se déroule (vérifiée par Playwright avec le rôle concerné).
//   ui      : clés i18n des libellés qui doivent être VISIBLES à l'arrivée sur `to`.
//   permissions : permissions supplémentaires (étape masquée sans elles).
//   accueil : l'étape décrit l'accueil de l'espace de la section ; masquée pour un employé d'un autre espace.
//   cible   : clé i18n du libellé à entourer d'un numéro sur la capture de la section.

export const ROLES_GUIDE = { ADMIN: "pdg", EMPLOYE: "employe", USER: "client", SUPERADMIN: "superadmin" };

const PDG = [
  {
    id: "demarrer",
    steps: [
      { id: "inscription", to: "/inscription", ui: ["auth.signup.workshopName", "auth.signup.firstName", "auth.signup.lastName", "auth.signup.email", "auth.signup.submit"] },
      { id: "connexion", to: "/login", ui: ["login.identifiant", "login.password", "login.submit", "login.createWorkshop"] },
      { id: "courriel" },
    ],
  },
  {
    id: "reperes",
    shot: { id: "pdg-accueil", to: "/" },
    steps: [
      { id: "menu", to: "/", ui: ["nav.clients", "nav.orders", "nav.stock"], cible: "nav.orders" },
      { id: "mobile" },
      { id: "cloche", to: "/notifications", ui: ["notif.subtitle"] },
      { id: "langue" },
    ],
  },
  {
    id: "clients",
    shot: { id: "pdg-clientes", to: "/clientes" },
    steps: [
      { id: "liste", to: "/clientes", ui: ["clientes.newCliente", "clientes.subtitle"], cible: "clientes.newCliente" },
      { id: "creer", to: "/clientes/nouvelle", ui: ["cli.form.lastName", "cli.form.firstName", "common.save"] },
      { id: "mesures" },
    ],
  },
  {
    id: "commandes",
    shot: { id: "pdg-commande-nouvelle", to: "/commandes/nouvelle" },
    steps: [
      { id: "creer", to: "/commandes/nouvelle", ui: ["cmd.formClient", "cmd.formTypeVetement", "cmd.formPrixTotal", "cmd.formPriorite", "cmd.formDateLivraison", "cmd.formEnregistrer"], cible: "cmd.formClient" },
      { id: "avancer", to: "/commandes", ui: ["commandes.newCommande", "commandes.subtitle"] },
      { id: "affecter", to: "/production", ui: ["prod.ouvertes", "prod.nonAffectees"] },
    ],
  },
  {
    id: "paiements",
    shot: { id: "pdg-commande-detail", to: "/commandes/{commande}" },
    steps: [
      { id: "encaisser", cible: "cmd.paieAjouter" },
      { id: "recu", to: "/recus", ui: ["recu.subtitle"] },
      { id: "historique", to: "/paiements", ui: ["paie.subtitle"] },
    ],
  },
  {
    id: "livraison",
    steps: [{ id: "terminer" }, { id: "livrer", to: "/livraisons", ui: ["livr.subtitle"] }],
  },
  {
    id: "demandes",
    steps: [{ id: "ouvrir", to: "/demandes", ui: ["demandesAdmin.subtitle"] }, { id: "accepter" }, { id: "refuser" }, { id: "vitrine" }],
  },
  {
    id: "stock",
    steps: [
      { id: "article", to: "/stock", ui: ["stock.newArticle", "stock.subtitle"] },
      { id: "mouvement" },
      { id: "fournisseur", to: "/fournisseurs", ui: ["fou.new", "fou.subtitle"] },
      { id: "achat", to: "/achats", ui: ["ach.new", "ach.subtitle"] },
      { id: "recevoir" },
      { id: "payer" },
    ],
  },
  {
    id: "argent",
    steps: [
      { id: "depense", to: "/depenses", ui: ["dep.newDepense", "dep.subtitle"] },
      { id: "finances", to: "/rapports", ui: ["rapports.finances", "rapports.encaisse"] },
      { id: "calendrier", to: "/calendrier", ui: ["cal.subtitle"] },
    ],
  },
  {
    id: "employes",
    shot: { id: "pdg-employe-nouveau", to: "/employes/nouveau", pleinePage: true },
    steps: [
      { id: "liste", to: "/employes", ui: ["emp.new", "emp.subtitle"] },
      { id: "identite", to: "/employes/nouveau", ui: ["emp.firstName", "emp.identifiant", "emp.password"], cible: "emp.identifiant" },
      { id: "poste", to: "/employes/nouveau", ui: ["emp.sectionPoste"], cible: "emp.sectionPoste" },
      { id: "droits", to: "/employes/nouveau", ui: ["emp.sectionPermissions"], cible: "emp.sectionPermissions" },
      { id: "creer", to: "/employes/nouveau", ui: ["emp.create"], cible: "emp.create" },
      { id: "gerer" },
    ],
  },
  {
    id: "invitation",
    steps: [{ id: "inviter" }, { id: "delai" }, { id: "effacement" }],
  },
  {
    id: "vitrine",
    shot: { id: "pdg-vitrine", to: "/vitrine" },
    steps: [
      { id: "publier" },
      { id: "activer", to: "/vitrine", ui: ["vitadm.active", "vitadm.slug", "vitadm.description"], cible: "vitadm.active" },
      { id: "partager" },
    ],
  },
  {
    id: "abonnement",
    shot: { id: "pdg-abonnement", to: "/abonnement" },
    steps: [
      { id: "etat", to: "/abonnement", ui: ["sub.currentStatus", "sub.faqTitle"], cible: "sub.currentStatus" },
      { id: "souscrire" },
      { id: "declarer" },
      { id: "attente" },
      { id: "fin" },
    ],
  },
  {
    id: "compte",
    steps: [
      { id: "parametres", to: "/parametres", ui: ["param.workshopName", "param.currency"] },
      { id: "motdepasse", to: "/compte", ui: ["account.language", "account.currentPassword"] },
    ],
  },
];

const EMPLOYE = [
  {
    id: "bienvenue",
    steps: [
      { id: "accueil", to: "/", ui: ["nav.myAccount"] },
      { id: "droits" },
      { id: "cloche", to: "/notifications", ui: ["notif.subtitle"], permissions: ["notifications.lire"] },
      { id: "compte", to: "/compte", ui: ["account.language", "account.currentPassword"] },
      { id: "lectureSeule" },
    ],
  },
  {
    id: "couturier",
    espace: "couturier",
    permissions: ["commandes.statut"],
    shot: { id: "employe-couturier", to: "/" },
    steps: [
      { id: "travaux", to: "/", ui: ["accueil.sections.mesTravaux.titre"], cible: "accueil.sections.mesTravaux.titre", accueil: true },
      { id: "ouvrir", to: "/commandes", ui: ["commandes.subtitle"] },
      { id: "mesures" },
      { id: "statut" },
    ],
  },
  {
    id: "reception",
    espace: "receptionniste",
    permissions: ["clientes.ecrire", "commandes.ecrire"],
    shot: { id: "employe-reception", to: "/" },
    steps: [
      { id: "accueil", to: "/", ui: ["accueil.sections.demandesAttente.titre", "accueil.sections.commandesALivrer.titre"], cible: "accueil.sections.demandesAttente.titre", accueil: true },
      { id: "cliente", to: "/clientes/nouvelle", ui: ["cli.form.lastName", "cli.form.firstName", "common.save"] },
      { id: "mesures" },
      { id: "commande", to: "/commandes/nouvelle", ui: ["cmd.formClient", "cmd.formTypeVetement", "cmd.formDateLivraison", "cmd.formEnregistrer"] },
    ],
  },
  {
    id: "demandes",
    espace: "receptionniste",
    permissions: ["demandes.lire", "demandes.ecrire", "commandes.lire"],
    steps: [{ id: "ouvrir", to: "/demandes", ui: ["demandesAdmin.subtitle"] }, { id: "accepter" }, { id: "refuser" }],
  },
  {
    id: "livraisons",
    espace: "receptionniste",
    permissions: ["livraisons.ecrire", "commandes.lire"],
    steps: [{ id: "pretes", to: "/livraisons", ui: ["livr.subtitle"] }, { id: "livrer" }],
  },
  {
    id: "magasinier",
    espace: "magasinier",
    permissions: ["stock.ecrire"],
    shot: { id: "employe-magasinier", to: "/" },
    steps: [
      { id: "alertes", to: "/", ui: ["accueil.sections.alertesStock.titre"], cible: "accueil.sections.alertesStock.titre", accueil: true },
      { id: "article", to: "/stock/nouveau", ui: ["common.save"] },
      { id: "mouvement" },
      { id: "fournisseurs", to: "/fournisseurs", ui: ["fou.new"], permissions: ["fournisseurs.ecrire"] },
      { id: "recevoir", to: "/achats", ui: ["ach.subtitle"], permissions: ["achats.recevoir"] },
    ],
  },
  {
    id: "comptable",
    espace: "comptable",
    permissions: ["paiements.lire", "finances.voir"],
    shot: { id: "employe-comptable", to: "/" },
    steps: [
      { id: "accueil", to: "/", ui: ["accueil.sections.paiementsRecents.titre", "accueil.sections.depensesRecentes.titre"], cible: "accueil.sections.paiementsRecents.titre", accueil: true },
      { id: "encaisser", permissions: ["paiements.ecrire", "commandes.lire"] },
      { id: "recus", to: "/recus", ui: ["recu.subtitle"] },
      { id: "depense", to: "/depenses/nouvelle", ui: ["dep.formCategorie", "dep.formMontant"], permissions: ["depenses.ecrire"] },
      { id: "rapports", to: "/rapports", ui: ["rapports.finances"], permissions: ["rapports.lire"] },
    ],
  },
  {
    id: "autre",
    espace: "general",
    steps: [{ id: "general" }],
  },
];

const CLIENT = [
  {
    id: "activer",
    steps: [
      { id: "invitation", to: "/client/activer", ui: [] },
      { id: "connexion", to: "/login", ui: ["login.clientToggleAction"] },
      { id: "oubli", to: "/mot-de-passe-oublie", ui: ["auth.forgot.intro", "auth.forgot.send"] },
    ],
  },
  {
    id: "reperes",
    shot: { id: "client-commandes", to: "/client/commandes" },
    steps: [
      { id: "menu", to: "/client/commandes", ui: ["client.commandesTitle"], cible: "client.commandesTitle" },
      { id: "mobile" },
      { id: "cloche", to: "/client/notifications", ui: ["client.notificationsSubtitle"] },
      { id: "profil", to: "/client", ui: ["client.profilSubtitle", "client.profilEditNote"] },
    ],
  },
  {
    id: "commandes",
    steps: [
      { id: "liste", to: "/client/commandes", ui: ["client.commandesSubtitle"] },
      { id: "detail" },
      { id: "etapes" },
      { id: "mesures", to: "/client/mesures", ui: ["client.mesuresSubtitle"] },
    ],
  },
  {
    id: "paiements",
    steps: [
      { id: "voir", to: "/client/paiements", ui: ["client.paiementsSubtitle"] },
      { id: "recus", to: "/client/recus", ui: ["client.recusSubtitle"] },
      { id: "generer" },
      { id: "regler" },
    ],
  },
  {
    id: "demandes",
    shot: { id: "client-demande", to: "/client/demandes/nouvelle" },
    steps: [
      { id: "ouvrir", to: "/client/demandes", ui: ["client.demandesSubtitle", "client.nouvelleDemande"] },
      { id: "ecrire", to: "/client/demandes/nouvelle", ui: ["client.nouvelleDemandeSubtitle", "client.envoyerDemande"], cible: "client.envoyerDemande" },
      { id: "suivre" },
    ],
  },
  {
    id: "notifications",
    steps: [{ id: "lire", to: "/client/notifications", ui: ["client.notificationsSubtitle"] }],
  },
  {
    id: "donnees",
    shot: { id: "client-profil", to: "/client" },
    steps: [
      { id: "ouvrir", to: "/client", ui: ["mesdonnees.titre", "mesdonnees.exporter", "mesdonnees.supprimer"], cible: "mesdonnees.exporter" },
      { id: "exporter" },
      { id: "supprimer" },
    ],
  },
  { id: "langue", steps: [{ id: "choisir" }] },
];

const SUPERADMIN = [
  {
    id: "reperes",
    shot: { id: "sa-vue-ensemble", to: "/vue-ensemble" },
    steps: [
      { id: "connexion", to: "/login", ui: ["login.identifiant", "login.submit"] },
      { id: "menu", to: "/vue-ensemble", ui: ["sa.layout.workshops", "sa.layout.payments", "sa.layout.pricing"], cible: "sa.layout.payments" },
      { id: "indicateurs", to: "/vue-ensemble", ui: ["sa.dashboard.kpiWorkshops", "sa.dashboard.alerts"] },
    ],
  },
  {
    id: "notifications",
    shot: { id: "sa-notifications", to: "/notifications-plateforme" },
    steps: [
      { id: "cloche", to: "/notifications-plateforme", ui: ["sa.notifications.paymentsTitle", "sa.notifications.alertsTitle"], cible: "sa.notifications.paymentsTitle" },
      { id: "compteur" },
    ],
  },
  {
    id: "paiements",
    shot: { id: "sa-paiements", to: "/paiements-abonnement" },
    steps: [
      { id: "ouvrir", to: "/paiements-abonnement", ui: ["saPay.title", "saPay.subtitle"], cible: "saPay.colReference" },
      { id: "rapprocher" },
      { id: "confirmer" },
      { id: "rejeter" },
      { id: "rembourser" },
    ],
  },
  {
    id: "ateliers",
    shot: { id: "sa-ateliers", to: "/ateliers" },
    steps: [
      { id: "liste", to: "/ateliers", ui: ["sa.ateliers.newWorkshop", "sa.ateliers.subtitle"], cible: "sa.ateliers.newWorkshop" },
      { id: "creer" },
      { id: "fiche" },
      { id: "suspendre" },
      { id: "motdepasse" },
      { id: "supprimer" },
    ],
  },
  {
    id: "impersonation",
    steps: [{ id: "entrer" }, { id: "agir" }, { id: "quitter" }, { id: "trace" }],
  },
  {
    id: "abonnements",
    steps: [
      { id: "vue", to: "/gestion-abonnements", ui: ["saSub.overview.subtitle"] },
      { id: "activer" },
      { id: "actions" },
    ],
  },
  {
    id: "formules",
    shot: { id: "sa-formules", to: "/tarifs-abonnement" },
    steps: [
      { id: "creer", to: "/tarifs-abonnement", ui: ["saSub.plans.newPlan", "saSub.plans.subtitle"], cible: "saSub.plans.newPlan" },
      { id: "prix" },
      { id: "activer" },
      { id: "contact" },
    ],
  },
  {
    id: "reglages",
    steps: [
      { id: "commerce", to: "/commerce", ui: ["saCom.title", "saCom.revenueTitle"] },
      { id: "grace", to: "/commerce", ui: ["saCom.settingsTitle", "saCom.graceDays", "saCom.instructions"] },
    ],
  },
  {
    id: "compte",
    steps: [{ id: "langue", to: "/mon-compte", ui: ["account.language", "account.currentPassword"] }],
  },
];

export const GUIDES = { pdg: PDG, employe: EMPLOYE, client: CLIENT, superadmin: SUPERADMIN };

/** Identifiants des guides, dans l'ordre de présentation. */
export const NOMS_GUIDES = Object.keys(GUIDES);

/** Toutes les captures déclarées, avec le guide qui les porte. */
export function toutesLesCaptures() {
  return NOMS_GUIDES.flatMap((guide) =>
    GUIDES[guide].filter((s) => s.shot).map((s) => ({ guide, section: s.id, ...s.shot, cibles: s.steps.filter((e) => e.cible).map((e) => ({ etape: e.id, cle: e.cible })) })),
  );
}
