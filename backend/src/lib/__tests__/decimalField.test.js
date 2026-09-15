import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decimalField } from "../decimalField.js";

const champ = decimalField({ maxIntegerDigits: 8, maxDecimals: 2, min: 0.01, max: 10_000_000, label: "Montant" });

describe("decimalField", () => {
  test("accepte un nombre et le convertit en chaîne décimale canonique", () => {
    const result = champ.safeParse(1500);
    assert.equal(result.success, true);
    assert.equal(result.data, "1500");
  });

  test("accepte une chaîne déjà décimale", () => {
    const result = champ.safeParse("1500.50");
    assert.equal(result.success, true);
    assert.equal(result.data, "1500.50");
  });

  test("rejette plus de décimales que maxDecimals", () => {
    assert.equal(champ.safeParse("10.999").success, false);
  });

  test("rejette plus de chiffres entiers que maxIntegerDigits", () => {
    assert.equal(champ.safeParse("123456789").success, false);
  });

  test("rejette une valeur en dessous du minimum", () => {
    assert.equal(champ.safeParse(0).success, false);
    assert.equal(champ.safeParse(-5).success, false);
  });

  test("rejette une valeur au-dessus du maximum", () => {
    assert.equal(champ.safeParse(10_000_001).success, false);
  });

  test("rejette un nombre non fini (NaN, Infinity)", () => {
    assert.equal(champ.safeParse(NaN).success, false);
    assert.equal(champ.safeParse(Infinity).success, false);
  });

  test("rejette une chaîne non numérique", () => {
    assert.equal(champ.safeParse("abc").success, false);
  });

  test("rejette un nombre négatif écrit en chaîne", () => {
    assert.equal(champ.safeParse("-100").success, false);
  });

  test("accepte exactement la borne minimale et maximale", () => {
    assert.equal(champ.safeParse(0.01).success, true);
    assert.equal(champ.safeParse(10_000_000).success, true);
  });
});
