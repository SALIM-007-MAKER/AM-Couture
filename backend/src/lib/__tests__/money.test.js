import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sumDecimal, computeSolde, statutPaiement } from "../money.js";

describe("sumDecimal", () => {
  test("additionne exactement, sans erreur d'arrondi flottant", () => {
    // 0.1 + 0.2 = 0.30000000000000004 en Number JS — decimal.js ne doit
    // jamais reproduire ce piège classique.
    const total = sumDecimal(["0.1", "0.2"]);
    assert.equal(total.toString(), "0.3");
  });

  test("tableau vide -> zéro", () => {
    assert.equal(sumDecimal([]).toString(), "0");
  });

  test("accepte un mélange de nombres et de chaînes", () => {
    assert.equal(sumDecimal([100, "50.25", 25]).toString(), "175.25");
  });
});

describe("computeSolde", () => {
  test("solde nul quand le total payé égale le prix", () => {
    const { totalPaye, solde } = computeSolde("10000", [{ montant: "10000" }]);
    assert.equal(totalPaye, "10000");
    assert.equal(solde, "0");
  });

  test("solde positif quand rien n'a été payé", () => {
    const { totalPaye, solde } = computeSolde("10000", []);
    assert.equal(totalPaye, "0");
    assert.equal(solde, "10000");
  });

  test("plusieurs paiements partiels s'additionnent correctement", () => {
    const { totalPaye, solde } = computeSolde("10000", [{ montant: "3000" }, { montant: "2500" }]);
    assert.equal(totalPaye, "5500");
    assert.equal(solde, "4500");
  });

  test("un paiement en trop produit un solde négatif (jamais masqué/plafonné)", () => {
    const { solde } = computeSolde("10000", [{ montant: "12000" }]);
    assert.equal(solde, "-2000");
  });

  test("n'exclut PAS elle-même les paiements annulés — à l'appelant de filtrer en amont", () => {
    // Documente le contrat explicite de la fonction (voir commentaire
    // source) : passer un paiement annulé le compte quand même.
    const { totalPaye } = computeSolde("10000", [{ montant: "1000", annuleAt: new Date() }]);
    assert.equal(totalPaye, "1000");
  });
});

describe("statutPaiement", () => {
  test("NON_PAYE quand rien n'a été payé", () => {
    assert.equal(statutPaiement("10000", "0"), "NON_PAYE");
  });

  test("NON_PAYE reste vrai même pour un total payé négatif (cas théorique)", () => {
    assert.equal(statutPaiement("10000", "-100"), "NON_PAYE");
  });

  test("PARTIELLEMENT_PAYE entre 0 et le prix total (exclusif)", () => {
    assert.equal(statutPaiement("10000", "5000"), "PARTIELLEMENT_PAYE");
  });

  test("PAYE quand le total payé atteint exactement le prix", () => {
    assert.equal(statutPaiement("10000", "10000"), "PAYE");
  });

  test("PAYE aussi en cas de trop-perçu", () => {
    assert.equal(statutPaiement("10000", "10500"), "PAYE");
  });

  test("accepte des Decimal en plus des chaînes", () => {
    assert.equal(statutPaiement(10000, 10000), "PAYE");
  });
});
