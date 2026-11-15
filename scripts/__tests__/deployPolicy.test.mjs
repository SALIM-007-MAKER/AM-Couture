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
