import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "../phone.js";

describe("normalizePhone", () => {
  test("retire les espaces, points, tirets et parenthèses", () => {
    assert.equal(normalizePhone("07 12 34 56 78"), "0712345678");
    assert.equal(normalizePhone("07.12.34.56.78"), "0712345678");
    assert.equal(normalizePhone("07-12-34-56-78"), "0712345678");
    assert.equal(normalizePhone("(07) 12 34 56 78"), "0712345678");
  });

  test("conserve un préfixe international avec +", () => {
    assert.equal(normalizePhone("+225 07 12 34 56 78"), "+2250712345678");
  });

  test("ne conserve un + que s'il est en tête", () => {
    // Un "+" ailleurs dans la chaîne est un caractère non numérique comme un
    // autre — retiré comme le reste, sans devenir un préfixe international.
    assert.equal(normalizePhone("07+12"), "0712");
  });

  test("retire les espaces en début/fin avant analyse", () => {
    assert.equal(normalizePhone("  +227 96592253  "), "+22796592253");
  });

  test("chaîne déjà propre reste inchangée", () => {
    assert.equal(normalizePhone("22796592253"), "22796592253");
  });

  test("chaîne vide reste vide", () => {
    assert.equal(normalizePhone(""), "");
  });
});
