// Espaces de travail : l'accueil d'un membre de l'atelier est choisi selon son métier (poste), puis chaque section n'est
// affichée que si ses permissions le permettent. Une seule application, un seul système de droits : un espace ne donne
// jamais accès à quoi que ce soit, il ne fait que choisir quoi mettre en avant. Le serveur revérifie chaque requête.
import { peut } from "../employes/permissions.js";

export const ESPACE_PAR_POSTE = {
  COUTURIER: "couturier",
  RECEPTIONNISTE: "receptionniste",
  MAGASINIER: "magasinier",
  COMPTABLE: "comptable",
};

/** Espace d'un compte : « pdg » pour le PDG, selon le poste pour un employé, « general » sinon (poste AUTRE ou inconnu). */
export function espaceDe(user) {
  if (!user) return null;
  if (user.role === "ADMIN") return "pdg";
  if (user.role === "EMPLOYE") return ESPACE_PAR_POSTE[user.poste] ?? "general";
  return null;
}

// Sections de chaque espace, dans l'ordre d'affichage. `permissions` : toutes requises pour que la section s'affiche.
export const SECTIONS_PAR_ESPACE = {
  couturier: [{ id: "mesTravaux", permissions: ["commandes.lire"] }],
  receptionniste: [
    { id: "demandesAttente", permissions: ["demandes.lire"] },
    { id: "commandesALivrer", permissions: ["commandes.lire"] },
    { id: "commandesEnRetard", permissions: ["commandes.lire"] },
  ],
  magasinier: [
    { id: "alertesStock", permissions: ["stock.lire"] },
    { id: "achatsAttendus", permissions: ["achats.lire"] },
  ],
  comptable: [
    { id: "indicateursFinanciers", permissions: ["dashboard.lire", "finances.voir"] },
    { id: "paiementsRecents", permissions: ["paiements.lire"] },
    { id: "depensesRecentes", permissions: ["depenses.lire"] },
  ],
  general: [],
};

// Raccourcis de chaque espace : un chemin d'écran et la permission qui le rend utile.
export const ACTIONS_PAR_ESPACE = {
  couturier: [{ id: "calendrier", to: "/calendrier", permission: "commandes.lire" }],
  receptionniste: [
    { id: "nouvelleCliente", to: "/clientes/nouvelle", permission: "clientes.ecrire" },
    { id: "nouvelleCommande", to: "/commandes/nouvelle", permission: "commandes.ecrire" },
    { id: "livraisons", to: "/livraisons", permission: "livraisons.lire" },
  ],
  magasinier: [
    { id: "nouvelArticle", to: "/stock/nouveau", permission: "stock.ecrire" },
    { id: "nouvelAchat", to: "/achats/nouveau", permission: "achats.ecrire" },
    { id: "fournisseurs", to: "/fournisseurs", permission: "fournisseurs.lire" },
  ],
  comptable: [
    { id: "nouvelleDepense", to: "/depenses/nouvelle", permission: "depenses.ecrire" },
    { id: "paiements", to: "/paiements", permission: "paiements.lire" },
    { id: "rapports", to: "/rapports", permission: "rapports.lire" },
  ],
  general: [],
};

/** Sections de l'espace du compte auxquelles il a réellement droit. Un espace inconnu n'en a aucune. */
export function sectionsVisibles(user) {
  const sections = SECTIONS_PAR_ESPACE[espaceDe(user)] ?? [];
  return sections.filter((s) => s.permissions.every((p) => peut(user, p)));
}

export function actionsVisibles(user) {
  const actions = ACTIONS_PAR_ESPACE[espaceDe(user)] ?? [];
  return actions.filter((a) => peut(user, a.permission));
}

const STATUTS_TERMINES = new Set(["TERMINEE", "LIVREE", "ANNULEE"]);

/** Travaux à confectionner : commandes ouvertes, la plus proche échéance d'abord (celles sans date à la fin). */
export function travauxAConfectionner(commandes, limite = 8) {
  return commandes
    .filter((c) => !STATUTS_TERMINES.has(c.statut))
    .sort((a, b) => {
      if (!a.dateLivraisonPrevue && !b.dateLivraisonPrevue) return 0;
      if (!a.dateLivraisonPrevue) return 1;
      if (!b.dateLivraisonPrevue) return -1;
      return new Date(a.dateLivraisonPrevue) - new Date(b.dateLivraisonPrevue);
    })
    .slice(0, limite);
}
