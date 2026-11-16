import { test } from "node:test";
import assert from "node:assert/strict";
import { decideMigration } from "../lib/deployPolicy.mjs";

test("production : migre", () => {
  const d = decideMigration({ VERCEL_ENV: "production", DIRECT_URL: "postgresql://x" });
  assert.equal(d.migrer, true);
});
test("prévisualisation : ne migre jamais", () => {
  const d = decideMigration({ VERCEL_ENV: "preview", DIRECT_URL: "postgresql://x" });
  assert.equal(d.migrer, false);
});
test("développement Vercel : ne migre pas", () => {
  assert.equal(decideMigration({ VERCEL_ENV: "development", DIRECT_URL: "x" }).migrer, false);
});
test("hors Vercel : ne migre pas", () => {
  assert.equal(decideMigration({ DIRECT_URL: "x" }).migrer, false);
});
test("interrupteur SKIP_MIGRATIONS=1 l'emporte, même en production", () => {
  assert.equal(decideMigration({ VERCEL_ENV: "production", DIRECT_URL: "x", SKIP_MIGRATIONS: "1" }).migrer, false);
});
test("SKIP_MIGRATIONS autre que « 1 » n'est pas pris en compte", () => {
  assert.equal(decideMigration({ VERCEL_ENV: "production", DIRECT_URL: "x", SKIP_MIGRATIONS: "0" }).migrer, true);
});
test("production sans DIRECT_URL : erreur explicite, pas de repli silencieux", () => {
  const d = decideMigration({ VERCEL_ENV: "production" });
  assert.equal(d.migrer, false);
  assert.ok(d.erreur);
});

import { envPourGeneration, URL_FACTICE_GENERATION } from "../lib/deployPolicy.mjs";

test("génération : sans DIRECT_URL (prévisualisation), une valeur factice est fournie", () => {
  const env = { VERCEL_ENV: "preview" };
  assert.equal(envPourGeneration(env, decideMigration(env)).DIRECT_URL, URL_FACTICE_GENERATION);
});
test("génération : une vraie DIRECT_URL n'est jamais remplacée", () => {
  const env = { VERCEL_ENV: "preview", DIRECT_URL: "postgresql://reelle" };
  assert.equal(envPourGeneration(env, decideMigration(env)).DIRECT_URL, "postgresql://reelle");
});
test("génération : un build de production qui migre garde l'exigence stricte (jamais de valeur factice)", () => {
  const env = { VERCEL_ENV: "production", DIRECT_URL: "postgresql://reelle" };
  assert.equal(envPourGeneration(env, decideMigration(env)).DIRECT_URL, "postgresql://reelle");
  // Production sans DIRECT_URL : decideMigration renvoie une erreur ; le script s'arrête avant la génération (voir vercel-build.mjs).
  assert.ok(decideMigration({ VERCEL_ENV: "production" }).erreur);
});
