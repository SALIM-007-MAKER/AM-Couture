import { test } from "node:test";
import assert from "node:assert/strict";
import { totalLignes } from "../calculs.js";

test("total : quantités et prix décimaux sans erreur de flottant", () => {
  assert.equal(totalLignes([{ quantite: "10", prixUnitaire: "2500" }, { quantite: "100", prixUnitaire: "50.50" }]), "30050");
  assert.equal(totalLignes([{ quantite: "0.1", prixUnitaire: "0.2" }]), "0.02");
  assert.equal(totalLignes([{ quantite: "3", prixUnitaire: "0.1" }]), "0.30");
});

test("total : saisie vide ou invalide compte pour zéro, virgule décimale acceptée", () => {
  assert.equal(totalLignes([{ quantite: "", prixUnitaire: "" }]), "0");
  assert.equal(totalLignes([{ quantite: "abc", prixUnitaire: "10" }]), "0");
  assert.equal(totalLignes([{ quantite: "2,5", prixUnitaire: "4" }]), "10");
  assert.equal(totalLignes([]), "0");
});
