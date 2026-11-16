import { test } from "node:test";
import assert from "node:assert/strict";
import { pourcentage, libelleTaux, maxEncaisse, estNegatif } from "../format.js";

test("pourcentage : proportion du maximum, bornée entre 0 et 100", () => {
  assert.equal(pourcentage("5000", "10000"), 50);
  assert.equal(pourcentage("10000", "10000"), 100);
  assert.equal(pourcentage("20000", "10000"), 100);
});

test("pourcentage : valeur nulle, négative ou maximum nul donnent 0, sans division par zéro", () => {
  assert.equal(pourcentage("0", "10000"), 0);
  assert.equal(pourcentage("-500", "10000"), 0);
  assert.equal(pourcentage("100", "0"), 0);
  assert.equal(pourcentage("abc", "10"), 0);
});

test("libelleTaux : tiret quand il n'y a aucune donnée, jamais 0 % trompeur", () => {
  assert.equal(libelleTaux(null), "—");
  assert.equal(libelleTaux(undefined), "—");
  assert.equal(libelleTaux(0), "0 %");
  assert.equal(libelleTaux(66.7), "66,7 %");
  assert.equal(libelleTaux(50), "50 %");
});

test("maxEncaisse : plus grand encaissement de la série, 0 si vide", () => {
  assert.equal(maxEncaisse([{ encaisse: "0" }, { encaisse: "27000" }, { encaisse: "10000.5" }]), 27000);
  assert.equal(maxEncaisse([]), 0);
  assert.equal(maxEncaisse(undefined), 0);
});

test("estNegatif", () => {
  assert.equal(estNegatif("-5000"), true);
  assert.equal(estNegatif("0"), false);
  assert.equal(estNegatif("42000"), false);
});
