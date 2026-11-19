import { test } from "node:test";
import assert from "node:assert/strict";
import { cleOperation } from "../cleOperation.js";

let n = 0;
const gen = () => `id${++n}`;

test("la première saisie reçoit une clé", () => {
  assert.equal(cleOperation(null, "a", gen).cle, "op-id1");
});

test("même saisie : même clé (double clic, renvoi) — aucune nouvelle clé n'est générée", () => {
  const avant = n;
  const p = cleOperation(null, "a", gen);
  const q = cleOperation(p, "a", gen);
  assert.equal(q.cle, p.cle);
  assert.equal(n, avant + 1);
});

test("saisie modifiée : nouvelle clé (le serveur refuse une même clé avec un autre corps)", () => {
  const p = cleOperation(null, "a", gen);
  assert.notEqual(cleOperation(p, "b", gen).cle, p.cle);
});

test("formulaire vidé après un succès puis ressaisi à l'identique : nouvelle opération, nouvelle clé", () => {
  const p = cleOperation(null, "a", gen);
  const vide = cleOperation(p, "", gen);
  const encore = cleOperation(vide, "a", gen);
  assert.notEqual(encore.cle, p.cle);
});
