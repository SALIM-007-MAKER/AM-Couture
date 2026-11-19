import { test } from "node:test";
import assert from "node:assert/strict";
import { RESSOURCES, formaterLimite } from "../quotas.js";
import { RESSOURCES as RESSOURCES_SERVEUR } from "../../../../../backend/src/lib/quotas.js";

test("la liste des ressources est la même côté interface et côté serveur (même ordre)", () => {
  assert.deepEqual(RESSOURCES, RESSOURCES_SERVEUR);
});

test("formaterLimite : nombre lisible, null pour illimité", () => {
  assert.equal(formaterLimite(null), null);
  assert.equal(formaterLimite(undefined), null);
  assert.match(formaterLimite(1000), /^1\D?000$/);
  assert.equal(formaterLimite(50), "50");
});
