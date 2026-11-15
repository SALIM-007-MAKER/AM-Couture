// Permissions côté interface (sans React). Le serveur reste SEUL juge : chaque route revérifie les permissions. Ici on ne
// fait qu'adapter l'interface (navigation, pages accessibles, boutons) pour qu'un employé ne voie pas des écrans qui ne
// lui répondraient que par des erreurs 403.

/** Réservé au PDG (compte ADMIN) : l'administration n'est pas déléguable. */
export const ADMIN_SEUL = "@admin";

/** Le compte a-t-il cette permission ? Le PDG a tout (sauf les écrans de plateforme) ; un employé seulement ce qui lui est accordé. */
export function peut(user, permission) {
  if (!user || !permission) return false;
  if (permission === ADMIN_SEUL) return user.role === "ADMIN";
  if (user.role === "ADMIN") return true;
  return user.role === "EMPLOYE" && Array.isArray(user.permissions) && user.permissions.includes(permission);
}

/** Permission requise pour afficher chaque écran de l'atelier (aussi utilisée par la navigation). `null` = tout membre. */
export const PERMISSION_PAR_CHEMIN = {
  "/": "dashboard.lire",
  "/clientes": "clientes.lire",
  "/modeles": "modeles.lire",
  "/stock": "stock.lire",
  "/commandes": "commandes.lire",
  "/demandes": "demandes.lire",
  "/livraisons": "livraisons.lire",
  "/paiements": "paiements.lire",
  "/depenses": "depenses.lire",
  "/recus": "paiements.lire",
  "/rapports": "rapports.lire",
  "/calendrier": "commandes.lire",
  "/finances": "finances.voir",
  "/notifications": "notifications.lire",
  "/parametres": ADMIN_SEUL,
  "/abonnement": ADMIN_SEUL,
  "/employes": ADMIN_SEUL,
  "/compte": null,
};

/** Le compte peut-il afficher cet écran ? Les chemins inconnus sont refusés (jamais ouverts par défaut). */
export function peutAcceder(user, chemin) {
  if (!(chemin in PERMISSION_PAR_CHEMIN)) return false;
  const requise = PERMISSION_PAR_CHEMIN[chemin];
  return requise === null ? Boolean(user) : peut(user, requise);
}

// Ordre de recherche de la page d'accueil d'un employé : la première à laquelle il a droit.
const ORDRE_ACCUEIL = ["/", "/commandes", "/clientes", "/stock", "/modeles", "/demandes", "/livraisons", "/notifications", "/compte"];

/** Page d'accueil d'un employé : tableau de bord s'il y a droit, sinon son premier écran autorisé ; « Mon compte » au pire. */
export function cheminAccueilEmploye(user) {
  return ORDRE_ACCUEIL.find((chemin) => peutAcceder(user, chemin)) ?? "/compte";
}

/** Retire des groupes de navigation les entrées auxquelles le compte n'a pas droit, et les groupes devenus vides. */
export function filtrerNavigation(groupes, user) {
  return groupes
    .map((groupe) => ({ ...groupe, items: groupe.items.filter((item) => peutAcceder(user, item.to)) }))
    .filter((groupe) => groupe.items.length > 0);
}

/** Libellés des postes proposés (clés de traduction), dans l'ordre d'affichage. */
export const POSTES_AFFICHES = ["COUTURIER", "RECEPTIONNISTE", "MAGASINIER", "COMPTABLE", "AUTRE"];

/**
 * Réécrit une liste de permissions comme le fait le serveur : une écriture ajoute la lecture du même module, changer le
 * statut d'une commande suppose de la lire, lire des paiements suppose de voir les montants. Sert à PRÉVISUALISER ce que
 * l'employé recevra réellement (le serveur recalcule de toute façon).
 */
export function completerPermissions(liste) {
  const ensemble = new Set(liste);
  const implications = { "commandes.statut": ["commandes.lire"], "paiements.lire": ["finances.voir"] };
  for (const p of [...ensemble]) if (p.endsWith(".ecrire")) implications[p] = [p.replace(".ecrire", ".lire")];
  let ajoute = true;
  while (ajoute) {
    ajoute = false;
    for (const p of [...ensemble]) {
      for (const i of implications[p] ?? []) {
        if (!ensemble.has(i)) {
          ensemble.add(i);
          ajoute = true;
        }
      }
    }
  }
  return [...ensemble].sort();
}

/** Droits sensibles que `nouvelles` ajoute par rapport à `anciennes` (ils exigent le mot de passe du PDG). */
export function sensiblesAjoutees(anciennes, nouvelles, sensibles) {
  const avant = new Set(anciennes);
  return nouvelles.filter((p) => sensibles.includes(p) && !avant.has(p));
}

/** Une permission cochée en impose-t-elle une autre ? (écrire → lire, etc.) Sert à verrouiller la case « lire » tant que « écrire » est cochée. */
export function imposeePar(permission, ensemble) {
  return [...ensemble].some((autre) => autre !== permission && completerPermissions([autre]).includes(permission));
}

/** Coche ou décoche une permission en gardant l'ensemble cohérent (les permissions impliquées suivent). */
export function basculerPermission(ensemble, permission, coche) {
  const courant = new Set(ensemble);
  if (coche) return completerPermissions([...courant, permission]);
  courant.delete(permission);
  return completerPermissions([...courant]);
}
