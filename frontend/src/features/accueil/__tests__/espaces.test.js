import { test } from "node:test";
import assert from "node:assert/strict";
import { espaceDe, sectionsVisibles, actionsVisibles, travauxAConfectionner, SECTIONS_PAR_ESPACE, ACTIONS_PAR_ESPACE } from "../espaces.js";
import { POSTES_AFFICHES, PERMISSION_PAR_CHEMIN } from "../../employes/permissions.js";

const employe = (poste, ...permissions) => ({ role: "EMPLOYE", poste, permissions });
const ids = (l) => l.map((x) => x.id);

test("espaceDe : PDG, un espace par poste, « general » pour AUTRE ou un poste inconnu, rien sans compte ou pour un client", () => {
  assert.equal(espaceDe({ role: "ADMIN" }), "pdg");
  assert.equal(espaceDe(employe("COUTURIER")), "couturier");
  assert.equal(espaceDe(employe("RECEPTIONNISTE")), "receptionniste");
  assert.equal(espaceDe(employe("MAGASINIER")), "magasinier");
  assert.equal(espaceDe(employe("COMPTABLE")), "comptable");
  assert.equal(espaceDe(employe("AUTRE")), "general");
  assert.equal(espaceDe(employe("INCONNU")), "general");
  assert.equal(espaceDe(employe(undefined)), "general");
  assert.equal(espaceDe(null), null);
  assert.equal(espaceDe({ role: "USER" }), null);
});

test("chaque poste proposé a un espace défini", () => {
  for (const poste of POSTES_AFFICHES) assert.ok(espaceDe(employe(poste)), poste);
});

test("sections : seulement celles dont TOUTES les permissions sont accordées", () => {
  const complet = employe("MAGASINIER", "stock.lire", "achats.lire");
  assert.deepEqual(ids(sectionsVisibles(complet)), ["alertesStock", "achatsAttendus"]);
  assert.deepEqual(ids(sectionsVisibles(employe("MAGASINIER", "stock.lire"))), ["alertesStock"]);
  assert.deepEqual(sectionsVisibles(employe("MAGASINIER")), []);
});

test("un employé n'obtient jamais une section grâce à son poste : le poste ne change pas les droits", () => {
  // Un comptable à qui le PDG a retiré « finances.voir » ne voit pas les indicateurs financiers.
  const comptable = employe("COMPTABLE", "dashboard.lire", "paiements.lire");
  assert.deepEqual(ids(sectionsVisibles(comptable)), ["paiementsRecents"]);
  assert.ok(!ids(sectionsVisibles(comptable)).includes("indicateursFinanciers"));
});

test("un employé dont le poste ne correspond pas aux droits ne voit que ce qui est autorisé", () => {
  const couturierCompta = employe("COUTURIER", "depenses.lire");
  assert.deepEqual(sectionsVisibles(couturierCompta), []);
});

test("le PDG a son tableau de bord existant : aucune section d'espace", () => {
  assert.deepEqual(sectionsVisibles({ role: "ADMIN" }), []);
  assert.deepEqual(actionsVisibles({ role: "ADMIN" }), []);
});

test("actions rapides : filtrées par permission", () => {
  const r = employe("RECEPTIONNISTE", "clientes.lire", "clientes.ecrire", "livraisons.lire");
  assert.deepEqual(ids(actionsVisibles(r)), ["nouvelleCliente", "livraisons"]);
});

test("tous les chemins d'actions rapides existent dans la table des écrans (aucun lien vers un écran inconnu)", () => {
  const connus = new Set(Object.keys(PERMISSION_PAR_CHEMIN));
  for (const actions of Object.values(ACTIONS_PAR_ESPACE)) {
    for (const a of actions) {
      const racine = "/" + a.to.split("/")[1];
      assert.ok(connus.has(racine), `${a.to} (${racine}) absent de PERMISSION_PAR_CHEMIN`);
    }
  }
});

test("chaque espace listé dans les sections existe aussi dans les actions", () => {
  assert.deepEqual(Object.keys(SECTIONS_PAR_ESPACE).sort(), Object.keys(ACTIONS_PAR_ESPACE).sort());
});

test("travauxAConfectionner : exclut terminées/livrées/annulées, échéance la plus proche d'abord, sans date en dernier, limité", () => {
  const cmds = [
    { id: "a", statut: "EN_CONFECTION", dateLivraisonPrevue: "2026-12-20" },
    { id: "b", statut: "TERMINEE", dateLivraisonPrevue: "2026-12-01" },
    { id: "c", statut: "NOUVELLE", dateLivraisonPrevue: "2026-12-05" },
    { id: "d", statut: "LIVREE", dateLivraisonPrevue: "2026-11-01" },
    { id: "e", statut: "RETOUCHES", dateLivraisonPrevue: null },
    { id: "f", statut: "ANNULEE", dateLivraisonPrevue: "2026-11-02" },
  ];
  assert.deepEqual(ids(travauxAConfectionner(cmds)), ["c", "a", "e"]);
  assert.equal(travauxAConfectionner(cmds, 2).length, 2);
  assert.equal(cmds.length, 6, "n'altère pas la liste d'origine");
});
