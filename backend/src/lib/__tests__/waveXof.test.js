import { test } from "node:test";
import assert from "node:assert/strict";
import { creerSessionCheckout, ErreurWave } from "../wave.js";

// Wave reste INACTIF (aucune configuration ici) : ces garde-fous sont préparatoires et refusent AVANT tout appel réseau un
// montant qui ne serait pas un entier de francs CFA.
for (const montant of ["2500.50", 0, -1, "abc", null, undefined]) {
  test(`aucune session Wave pour un montant non entier en XOF (${String(montant)})`, async () => {
    await assert.rejects(
      () => creerSessionCheckout({ montant, referenceInterne: "WAV-test", successUrl: "https://x/ok", errorUrl: "https://x/ko" }),
      (err) => err instanceof ErreurWave && /entier/.test(err.message),
    );
  });
}
