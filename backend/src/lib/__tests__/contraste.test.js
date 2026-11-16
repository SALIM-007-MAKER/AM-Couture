import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { luminance, rapportContraste, lisibleSurBlanc } from "../contraste.js";

describe("contraste", () => {
  it("valeurs de référence WCAG : noir/blanc = 21, identique = 1", () => {
    assert.equal(rapportContraste("#000000", "#ffffff").toFixed(2), "21.00");
    assert.equal(rapportContraste("#336699", "#336699").toFixed(2), "1.00");
    assert.equal(luminance("#ffffff"), 1);
    assert.equal(luminance("#000000"), 0);
  });

  it("le bleu de l'application et un bordeaux portent un texte blanc ; un jaune ou un rose pâle non", () => {
    assert.equal(lisibleSurBlanc("#276386"), true);
    assert.equal(lisibleSurBlanc("#800020"), true);
    assert.equal(lisibleSurBlanc("#ffd700"), false);
    assert.equal(lisibleSurBlanc("#ffc0cb"), false);
    assert.equal(lisibleSurBlanc("#ffffff"), false);
  });

  it("refuse ce qui n'est pas #RRGGBB", () => {
    assert.throws(() => luminance("rouge"));
    assert.throws(() => luminance("#fff"));
  });
});
