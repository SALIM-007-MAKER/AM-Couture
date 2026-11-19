import { test } from "node:test";
import assert from "node:assert/strict";
import { moisCourt, moisComplet, anneeAAfficher, estVide, texteInfobulle } from "../tendances.js";

const donnees = [{ mois: "2026-10" }, { mois: "2026-11" }, { mois: "2026-12" }, { mois: "2027-01" }, { mois: "2027-02" }];

test("mois complet avec l'année, dans les deux langues", () => {
  assert.match(moisComplet("2026-11", "fr"), /novembre 2026/i);
  assert.match(moisComplet("2026-11", "en"), /November 2026/);
});

test("mois court pour l'axe", () => {
  assert.match(moisCourt("2026-11", "fr"), /^nov/i);
  assert.match(moisCourt("2026-11", "en"), /^Nov/);
});

test("l'année n'apparaît que sur la première colonne et en janvier", () => {
  assert.deepEqual(donnees.map((_, i) => anneeAAfficher(donnees, i)), ["2026", null, null, "2027", null]);
});

test("estVide : aucune valeur positive (absente, zéro, négative, texte) ; une seule valeur positive suffit", () => {
  assert.equal(estVide([{ revenus: 0 }, { revenus: 0 }], "revenus"), true);
  assert.equal(estVide([], "revenus"), true);
  assert.equal(estVide(undefined, "revenus"), true);
  assert.equal(estVide([{ revenus: 0 }, { revenus: 1500 }], "revenus"), false);
  assert.equal(estVide([{ nouveauxAteliers: 0 }, { nouveauxAteliers: 2 }], "nouveauxAteliers"), false);
});

test("infobulle : mois complet, nombre localisé et unité FCFA", () => {
  const fr = texteInfobulle("2026-11", 12000, { langue: "fr", unite: "FCFA" });
  assert.match(fr, /^novembre 2026 : 12\s000 FCFA$|^novembre 2026 : 12.000 FCFA$/i);
  assert.equal(texteInfobulle("2026-11", 3), "novembre 2026 : 3");
});
