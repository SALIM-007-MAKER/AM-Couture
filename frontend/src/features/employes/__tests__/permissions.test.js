import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_SEUL,
  peut,
  peutAcceder,
  PERMISSION_PAR_CHEMIN,
  cheminAccueilEmploye,
  filtrerNavigation,
  completerPermissions,
  sensiblesAjoutees,
} from "../permissions.js";

const pdg = { role: "ADMIN" };
const employe = (...permissions) => ({ role: "EMPLOYE", permissions });

test("peut : le PDG a tout, un employé seulement ce qu'on lui a accordé", () => {
  assert.equal(peut(pdg, "finances.voir"), true);
  assert.equal(peut(employe("clientes.lire"), "clientes.lire"), true);
  assert.equal(peut(employe("clientes.lire"), "clientes.ecrire"), false);
  assert.equal(peut(employe(), "clientes.lire"), false);
  assert.equal(peut({ role: "EMPLOYE" }, "clientes.lire"), false, "permissions absentes");
  assert.equal(peut(null, "clientes.lire"), false);
});

test("peut : l'administration est réservée au PDG, jamais déléguée", () => {
  assert.equal(peut(pdg, ADMIN_SEUL), true);
  assert.equal(peut(employe("clientes.lire", "finances.voir"), ADMIN_SEUL), false);
  assert.equal(peut({ role: "SUPERADMIN" }, ADMIN_SEUL), false);
});

test("peutAcceder : écrans de l'atelier selon les permissions ; les chemins inconnus sont refusés", () => {
  const couturier = employe("clientes.lire", "commandes.lire", "commandes.statut");
  assert.equal(peutAcceder(couturier, "/commandes"), true);
  assert.equal(peutAcceder(couturier, "/calendrier"), true, "le calendrier est celui des commandes");
  assert.equal(peutAcceder(couturier, "/paiements"), false);
  assert.equal(peutAcceder(couturier, "/depenses"), false);
  assert.equal(peutAcceder(couturier, "/finances"), false);
  assert.equal(peutAcceder(couturier, "/employes"), false);
  assert.equal(peutAcceder(couturier, "/compte"), true, "Mon compte est ouvert à tout membre");
  assert.equal(peutAcceder(couturier, "/n-importe-quoi"), false);
  assert.equal(peutAcceder(pdg, "/employes"), true);
  assert.equal(peutAcceder(null, "/compte"), false);
});

test("chaque écran d'administration est réservé au PDG", () => {
  for (const chemin of ["/parametres", "/abonnement", "/employes"]) assert.equal(PERMISSION_PAR_CHEMIN[chemin], ADMIN_SEUL, chemin);
});

test("cheminAccueilEmploye : toujours l'espace de travail « / », ouvert à tout membre quels que soient ses droits", () => {
  for (const droits of [[], ["commandes.lire"], ["stock.lire"], ["depenses.lire"], ["dashboard.lire", "commandes.lire"]]) {
    const e = employe(...droits);
    assert.equal(cheminAccueilEmploye(e), "/");
    assert.equal(peutAcceder(e, "/"), true, "l'accueil est accessible : aucune redirection en boucle");
  }
});

test("le tableau de bord complet reste réservé à « dashboard.lire » pour un employé", () => {
  assert.equal(peutAcceder(employe("commandes.lire"), "/tableau-de-bord"), false);
  assert.equal(peutAcceder(employe("dashboard.lire"), "/tableau-de-bord"), true);
  assert.equal(peutAcceder(pdg, "/tableau-de-bord"), true);
});

test("filtrerNavigation : retire les entrées interdites et les groupes vides, sans modifier l'original", () => {
  const groupes = [
    { labelKey: "a", items: [{ to: "/" }, { to: "/clientes" }] },
    { labelKey: "b", items: [{ to: "/paiements" }, { to: "/depenses" }] },
    { labelKey: "c", items: [{ to: "/parametres" }, { to: "/compte" }] },
  ];
  const filtre = filtrerNavigation(groupes, employe("clientes.lire"));
  assert.deepEqual(filtre.map((g) => [g.labelKey, g.items.map((i) => i.to)]), [["a", ["/", "/clientes"]], ["c", ["/compte"]]]);
  assert.equal(groupes[1].items.length, 2);
  assert.equal(filtrerNavigation(groupes, pdg).length, 3);
});

test("completerPermissions : reproduit les implications du serveur", () => {
  assert.deepEqual(completerPermissions(["stock.ecrire"]), ["stock.ecrire", "stock.lire"]);
  assert.deepEqual(completerPermissions(["commandes.statut"]), ["commandes.lire", "commandes.statut"]);
  assert.deepEqual(completerPermissions(["paiements.ecrire"]), ["finances.voir", "paiements.ecrire", "paiements.lire"]);
  assert.deepEqual(completerPermissions(["depenses.ecrire"]), ["depenses.ecrire", "depenses.lire"]);
});

test("sensiblesAjoutees : seuls les droits sensibles nouveaux demandent confirmation", () => {
  const sensibles = ["finances.voir", "paiements.lire"];
  assert.deepEqual(sensiblesAjoutees(["clientes.lire"], ["clientes.lire", "finances.voir"], sensibles), ["finances.voir"]);
  assert.deepEqual(sensiblesAjoutees(["finances.voir"], ["finances.voir"], sensibles), []);
  assert.deepEqual(sensiblesAjoutees(["finances.voir"], [], sensibles), []);
});

// Garde-fous de dérive avec le serveur : les implications et le catalogue ne doivent pas diverger.
import { CATALOGUE, PERMISSIONS, PERMISSIONS_SENSIBLES, POSTES, normaliserPermissions } from "../../../../../backend/src/lib/permissions.js";

test("dérive : chaque permission exigée par un écran existe dans le catalogue du serveur", () => {
  for (const [chemin, requise] of Object.entries(PERMISSION_PAR_CHEMIN)) {
    if (requise === null || requise === ADMIN_SEUL) continue;
    assert.ok(CATALOGUE[requise], `${chemin} exige « ${requise} », inconnue du serveur`);
  }
});

test("dérive : completerPermissions donne le même résultat que le serveur, pour chaque permission et chaque poste", () => {
  for (const p of PERMISSIONS) assert.deepEqual(completerPermissions([p]), normaliserPermissions([p]), p);
  for (const [poste, liste] of Object.entries(POSTES)) assert.deepEqual(completerPermissions(liste), normaliserPermissions(liste), poste);
});

test("dérive : les droits sensibles du serveur sont bien ceux qui ouvrent l'argent", () => {
  assert.deepEqual([...PERMISSIONS_SENSIBLES].sort(), ["achats.ecrire", "depenses.ecrire", "depenses.lire", "finances.voir", "paiements.ecrire", "paiements.lire"]);
});

import { imposeePar, basculerPermission } from "../permissions.js";

test("imposeePar : « lire » est verrouillée tant qu'« écrire » ou « statut » est coché", () => {
  assert.equal(imposeePar("stock.lire", ["stock.ecrire", "stock.lire"]), true);
  assert.equal(imposeePar("commandes.lire", ["commandes.statut", "commandes.lire"]), true);
  assert.equal(imposeePar("stock.lire", ["stock.lire"]), false);
  assert.equal(imposeePar("finances.voir", ["paiements.lire", "finances.voir"]), true, "lire les paiements impose de voir les montants");
});

test("basculerPermission : cocher ajoute les permissions impliquées ; décocher « écrire » garde « lire »", () => {
  assert.deepEqual(basculerPermission([], "stock.ecrire", true), ["stock.ecrire", "stock.lire"]);
  assert.deepEqual(basculerPermission(["stock.ecrire", "stock.lire"], "stock.ecrire", false), ["stock.lire"]);
  assert.deepEqual(basculerPermission(["stock.lire"], "stock.lire", false), []);
});

test("basculerPermission : on ne peut pas décocher une permission encore imposée par une autre", () => {
  assert.deepEqual(basculerPermission(["stock.ecrire", "stock.lire"], "stock.lire", false), ["stock.ecrire", "stock.lire"]);
});
