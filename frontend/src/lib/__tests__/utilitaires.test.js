import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuery } from "../queryString.js";
import { generatePassword } from "../generatePassword.js";

test("buildQuery : ignore undefined, null et chaîne vide", () => {
  assert.equal(buildQuery({ q: "", archived: undefined, page: null }), "");
  assert.equal(buildQuery(), "");
});

test("buildQuery : conserve 0 et false (valeurs réelles, pas des absences)", () => {
  assert.equal(buildQuery({ page: 0, archived: false }), "?page=0&archived=false");
});

test("buildQuery : encode les caractères spéciaux", () => {
  assert.equal(buildQuery({ q: "a b&c=d" }), "?q=a+b%26c%3Dd");
});

test("buildQuery : convertit les nombres en texte", () => {
  assert.equal(buildQuery({ limit: 20 }), "?limit=20");
});

test("generatePassword : longueur demandée, 12 par défaut", () => {
  assert.equal(generatePassword().length, 12);
  assert.equal(generatePassword(20).length, 20);
});

test("generatePassword : jamais de caractère ambigu (0 O 1 l I)", () => {
  for (let i = 0; i < 200; i++) assert.doesNotMatch(generatePassword(32), /[0O1lI]/);
});

test("generatePassword : uniquement lettres et chiffres", () => {
  for (let i = 0; i < 50; i++) assert.match(generatePassword(32), /^[A-Za-z0-9]+$/);
});

test("generatePassword : deux appels donnent des valeurs différentes", () => {
  assert.notEqual(generatePassword(16), generatePassword(16));
});
