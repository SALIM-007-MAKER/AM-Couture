import { test } from "node:test";
import assert from "node:assert/strict";
import { modeEmailLocal, afficherLienLocal } from "../lienLocal.js";

test("actif seulement en développement, sans clé Resend, hors Vercel", () => {
  assert.equal(modeEmailLocal({ NODE_ENV: "development" }), true);
});

test("jamais en production, même sans clé Resend", () => {
  assert.equal(modeEmailLocal({ NODE_ENV: "production" }), false);
});

test("jamais si NODE_ENV est absent ou inattendu (liste d'autorisation stricte)", () => {
  assert.equal(modeEmailLocal({}), false);
  assert.equal(modeEmailLocal({ NODE_ENV: "staging" }), false);
  assert.equal(modeEmailLocal({ NODE_ENV: "test" }), false);
});

test("jamais si une clé Resend est configurée : l'envoi réel est conservé", () => {
  assert.equal(modeEmailLocal({ NODE_ENV: "development", RESEND_API_KEY: "re_x" }), false);
});

test("jamais sur Vercel, même avec NODE_ENV=development", () => {
  assert.equal(modeEmailLocal({ NODE_ENV: "development", VERCEL: "1" }), false);
});

test("le lien est écrit sur la sortie fournie", () => {
  const lignes = [];
  afficherLienLocal({ libelle: "Lien", identifiant: "admin", lien: "http://localhost:5173/x?token=abc" }, (l) => lignes.push(l));
  assert.equal(lignes.length, 1);
  assert.match(lignes[0], /http:\/\/localhost:5173\/x\?token=abc/);
  assert.match(lignes[0], /aucun email envoyé/);
});
