import { test } from "node:test";
import assert from "node:assert/strict";
import { limiteConnexion, LIMITE_CONNEXION, LIMITE_CONNEXION_LOCALE } from "../rateLimiter.js";

test("la limite de production reste à 10 tentatives", () => {
  assert.equal(LIMITE_CONNEXION, 10);
});

test("relevée seulement en développement local", () => {
  assert.equal(limiteConnexion({ NODE_ENV: "development" }), LIMITE_CONNEXION_LOCALE);
  assert.ok(LIMITE_CONNEXION_LOCALE > LIMITE_CONNEXION);
});

test("10 en production, en test, sans NODE_ENV, avec une valeur inattendue, ou sur Vercel", () => {
  for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "test" }, {}, { NODE_ENV: "staging" }, { NODE_ENV: "development", VERCEL: "1" }]) {
    assert.equal(limiteConnexion(env), LIMITE_CONNEXION, JSON.stringify(env));
  }
});
