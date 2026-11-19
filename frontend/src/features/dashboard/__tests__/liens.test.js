import { test } from "node:test";
import assert from "node:assert/strict";
import { lienToutVoir, dateIso } from "../liens.js";
import { POSTES } from "../../../../../backend/src/lib/permissions.js";

const peutAvec = (liste) => (p) => liste.includes(p);
const AUJOURDHUI = new Date(2026, 10, 19, 9, 30); // 19 novembre 2026, heure locale

test("avec rapports.lire : comportement historique, la page Rapports, pour les deux listes", () => {
  const peut = peutAvec(["rapports.lire", "commandes.lire", "dashboard.lire"]);
  assert.equal(lienToutVoir(peut, "enRetard", { aujourdhui: AUJOURDHUI }), "/rapports");
  assert.equal(lienToutVoir(peut, "aLivrer", { aujourdhui: AUJOURDHUI }), "/rapports");
});

test("sans rapports.lire mais avec commandes.lire : la liste des commandes, filtrée", () => {
  const peut = peutAvec(["dashboard.lire", "commandes.lire"]);
  assert.equal(lienToutVoir(peut, "enRetard", { aujourdhui: AUJOURDHUI }), "/commandes?enRetard=true");
  assert.equal(lienToutVoir(peut, "aLivrer", { aujourdhui: AUJOURDHUI, jours: 3 }), "/commandes?livraisonDu=2026-11-19&livraisonAu=2026-11-22");
});

test("l'horizon passe le mois : 28 novembre + 3 jours = 1er décembre", () => {
  const peut = peutAvec(["commandes.lire"]);
  assert.equal(lienToutVoir(peut, "aLivrer", { aujourdhui: new Date(2026, 10, 28), jours: 3 }), "/commandes?livraisonDu=2026-11-28&livraisonAu=2026-12-01");
});

test("sans rapports.lire ni commandes.lire : aucun lien (jamais un lien qui redirige)", () => {
  const peut = peutAvec(["dashboard.lire"]);
  assert.equal(lienToutVoir(peut, "enRetard"), null);
  assert.equal(lienToutVoir(peut, "aLivrer"), null);
});

test("postes de base : la réceptionniste va vers /commandes, le comptable vers /rapports, jamais de rapports.lire ajouté à la réceptionniste", () => {
  assert.ok(!POSTES.RECEPTIONNISTE.includes("rapports.lire"));
  assert.match(lienToutVoir(peutAvec(POSTES.RECEPTIONNISTE), "enRetard"), /^\/commandes\?/);
  assert.equal(lienToutVoir(peutAvec(POSTES.COMPTABLE), "enRetard"), "/rapports");
  assert.equal(lienToutVoir(peutAvec(POSTES.COMPTABLE), "aLivrer"), "/rapports");
});

test("dateIso : zéros de remplissage", () => {
  assert.equal(dateIso(new Date(2026, 0, 5)), "2026-01-05");
});
