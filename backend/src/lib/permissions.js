// Permissions des employés d'un atelier. Fonctions PURES (aucun accès à la base).
//
// Modèle :
//  - le PDG (rôle ADMIN) a TOUS les droits sur son atelier ; le SUPERADMIN n'opère jamais directement sur un atelier ;
//  - un EMPLOYE n'a que les permissions listées dans User.permissions, relues en base à chaque requête ;
//  - un « poste » n'est qu'un MODÈLE qui pré-remplit les permissions à la création ; le PDG les ajuste ensuite employé
//    par employé, et un changement de poste ne réécrit jamais les permissions déjà accordées ;
//  - ce qui relève de l'ADMINISTRATION de l'atelier (employés, paramètres, abonnement et ses paiements) n'est PAS dans
//    le catalogue : il ne peut pas être délégué ;
//  - les droits qui donnent accès à l'ARGENT sont dits « sensibles » : leur attribution exige une confirmation du PDG
//    par son mot de passe (voir routes/employes.routes.js).

/** Catalogue des permissions déléguables. Clé = « module.action ». */
export const CATALOGUE = {
  "clientes.lire": { module: "clientes", sensible: false },
  "clientes.ecrire": { module: "clientes", sensible: false },
  "modeles.lire": { module: "modeles", sensible: false },
  "modeles.ecrire": { module: "modeles", sensible: false },
  "commandes.lire": { module: "commandes", sensible: false },
  "commandes.ecrire": { module: "commandes", sensible: false },
  "commandes.statut": { module: "commandes", sensible: false },
  "livraisons.lire": { module: "livraisons", sensible: false },
  "livraisons.ecrire": { module: "livraisons", sensible: false },
  "demandes.lire": { module: "demandes", sensible: false },
  "demandes.ecrire": { module: "demandes", sensible: false },
  "stock.lire": { module: "stock", sensible: false },
  "stock.ecrire": { module: "stock", sensible: false },
  "dashboard.lire": { module: "dashboard", sensible: false },
  "rapports.lire": { module: "rapports", sensible: false },
  "notifications.lire": { module: "notifications", sensible: false },
  // Argent : encaissements, dépenses, montants visibles partout.
  "paiements.lire": { module: "paiements", sensible: true },
  "paiements.ecrire": { module: "paiements", sensible: true },
  "depenses.lire": { module: "depenses", sensible: true },
  "depenses.ecrire": { module: "depenses", sensible: true },
  "finances.voir": { module: "finances", sensible: true },
};

export const PERMISSIONS = Object.keys(CATALOGUE);
export const PERMISSIONS_SENSIBLES = new Set(PERMISSIONS.filter((p) => CATALOGUE[p].sensible));

// Une permission d'écriture suppose la lecture du même module ; changer le statut d'une commande suppose de la lire ;
// consulter ou enregistrer des paiements suppose de voir les montants des commandes (solde, prix).
const IMPLICATIONS = { "commandes.statut": ["commandes.lire"], "paiements.lire": ["finances.voir"] };
for (const p of PERMISSIONS) {
  if (p.endsWith(".ecrire")) IMPLICATIONS[p] = [...(IMPLICATIONS[p] ?? []), p.replace(".ecrire", ".lire")];
}

/** Postes : modèles de permissions. Le poste « AUTRE » ne donne que les notifications. */
export const POSTES = {
  COUTURIER: ["clientes.lire", "commandes.lire", "commandes.statut", "modeles.lire", "stock.lire", "notifications.lire"],
  RECEPTIONNISTE: [
    "clientes.lire",
    "clientes.ecrire",
    "modeles.lire",
    "commandes.lire",
    "commandes.ecrire",
    "livraisons.lire",
    "livraisons.ecrire",
    "demandes.lire",
    "demandes.ecrire",
    "dashboard.lire",
    "notifications.lire",
  ],
  MAGASINIER: ["stock.lire", "stock.ecrire", "modeles.lire", "notifications.lire"],
  COMPTABLE: [
    "clientes.lire",
    "commandes.lire",
    "paiements.lire",
    "paiements.ecrire",
    "depenses.lire",
    "depenses.ecrire",
    "finances.voir",
    "rapports.lire",
    "dashboard.lire",
    "notifications.lire",
  ],
  AUTRE: ["notifications.lire"],
};
export const NOMS_POSTES = Object.keys(POSTES);

/**
 * Valide, complète (implications) et trie une liste de permissions.
 * @throws {Error} avec `inconnues` si une permission n'appartient pas au catalogue.
 */
export function normaliserPermissions(liste) {
  const demandees = new Set(liste ?? []);
  const inconnues = [...demandees].filter((p) => !CATALOGUE[p]);
  if (inconnues.length > 0) {
    const err = new Error(`Permissions inconnues : ${inconnues.join(", ")}`);
    err.inconnues = inconnues;
    throw err;
  }
  // Fermeture transitive (écrire → lire → voir les montants).
  let ajoute = true;
  while (ajoute) {
    ajoute = false;
    for (const p of [...demandees]) {
      for (const impliquee of IMPLICATIONS[p] ?? []) {
        if (!demandees.has(impliquee)) {
          demandees.add(impliquee);
          ajoute = true;
        }
      }
    }
  }
  return [...demandees].sort();
}

/** Permissions sensibles présentes dans `nouvelles` et absentes de `anciennes` (celles qu'il faut confirmer). */
export function sensiblesAjoutees(anciennes, nouvelles) {
  const avant = new Set(anciennes ?? []);
  return (nouvelles ?? []).filter((p) => PERMISSIONS_SENSIBLES.has(p) && !avant.has(p));
}

/** Le compte a-t-il cette permission ? Le PDG (ADMIN) les a toutes ; un employé seulement celles qui lui sont accordées. */
export function aPermission(user, permission) {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (user.role === "EMPLOYE") return Array.isArray(user.permissions) && user.permissions.includes(permission);
  return false;
}

export const peutVoirFinances = (user) => aPermission(user, "finances.voir");

/** Permission requise par une méthode HTTP pour un module : lecture pour GET/HEAD/OPTIONS, écriture sinon. */
export function permissionPourMethode(module, methode) {
  return `${module}.${["GET", "HEAD", "OPTIONS"].includes(methode) ? "lire" : "ecrire"}`;
}

/** Catalogue sérialisé pour l'interface : permissions regroupées par module, postes et leurs modèles. */
export function catalogueSerialise() {
  const modules = {};
  for (const p of PERMISSIONS) {
    (modules[CATALOGUE[p].module] ??= []).push({ permission: p, sensible: CATALOGUE[p].sensible });
  }
  return { modules, postes: POSTES, sensibles: [...PERMISSIONS_SENSIBLES] };
}
