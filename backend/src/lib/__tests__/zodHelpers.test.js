import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { emptyToUndefined, normalizeText, optionalTrimmed, optionalUrlField, optionalImageField } from "../zodHelpers.js";

describe("emptyToUndefined", () => {
  test("transforme chaîne vide, null et undefined en undefined", () => {
    assert.equal(emptyToUndefined(""), undefined);
    assert.equal(emptyToUndefined(null), undefined);
    assert.equal(emptyToUndefined(undefined), undefined);
  });

  test("laisse toute autre valeur inchangée", () => {
    assert.equal(emptyToUndefined("abc"), "abc");
    assert.equal(emptyToUndefined(0), 0);
    assert.equal(emptyToUndefined(false), false);
  });
});

describe("normalizeText", () => {
  test("retire les espaces en début/fin", () => {
    assert.equal(normalizeText("  Bonjour  "), "Bonjour");
  });

  test("réduit les espaces multiples internes à un seul", () => {
    assert.equal(normalizeText("Bonjour     le    monde"), "Bonjour le monde");
  });

  test("normalise aussi tabulations et retours à la ligne internes", () => {
    assert.equal(normalizeText("Bonjour\t\nle monde"), "Bonjour le monde");
  });
});

describe("optionalTrimmed", () => {
  const champ = optionalTrimmed(10);

  test("chaîne vide devient undefined (champ non fourni)", () => {
    assert.equal(champ.safeParse("").data, undefined);
  });

  test("normalise le texte fourni", () => {
    assert.equal(champ.safeParse("  a   b  ").data, "a b");
  });

  test("rejette au-delà de la longueur maximale", () => {
    assert.equal(champ.safeParse("a".repeat(11)).success, false);
  });
});

describe("optionalUrlField", () => {
  const champ = optionalUrlField();

  test("accepte une URL https valide", () => {
    const result = champ.safeParse("https://exemple.com/photo.jpg");
    assert.equal(result.success, true);
    assert.equal(result.data, "https://exemple.com/photo.jpg");
  });

  test("rejette un protocole non http(s) (ex: javascript:)", () => {
    assert.equal(champ.safeParse("javascript:alert(1)").success, false);
  });

  test("rejette une chaîne qui n'est pas une URL", () => {
    assert.equal(champ.safeParse("pas une url").success, false);
  });

  test("chaîne vide -> undefined (champ optionnel)", () => {
    assert.equal(champ.safeParse("").data, undefined);
  });
});

describe("optionalImageField", () => {
  const champ = optionalImageField(1000); // 1000 octets max pour ce test

  function fabriquerDataUrl(taillePayloadOctets) {
    // Chaque groupe de 4 caractères base64 encode 3 octets — approximation
    // volontairement simple, suffisante pour tester la limite de taille.
    const nbCars = Math.ceil((taillePayloadOctets * 4) / 3);
    return `data:image/png;base64,${"A".repeat(nbCars)}`;
  }

  test("accepte une data URL image sous la limite de taille", () => {
    const result = champ.safeParse(fabriquerDataUrl(500));
    assert.equal(result.success, true);
  });

  test("rejette une data URL image au-delà de la limite de taille", () => {
    const result = champ.safeParse(fabriquerDataUrl(2000));
    assert.equal(result.success, false);
  });

  test("accepte une URL http(s) classique (compatibilité)", () => {
    assert.equal(champ.safeParse("https://exemple.com/logo.png").success, true);
  });

  test("rejette un format de data URL non supporté (ex: svg)", () => {
    assert.equal(champ.safeParse("data:image/svg+xml;base64,QUFB").success, false);
  });

  test("rejette une chaîne qui n'est ni une data URL ni une URL http(s)", () => {
    assert.equal(champ.safeParse("n'importe quoi").success, false);
  });
});
