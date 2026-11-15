import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { journaliser, log, formaterLigne, messageErreur } from "../logger.js";

let lignes;
const orig = { log: console.log, warn: console.warn, error: console.error };
const niveauInitial = process.env.LOG_LEVEL;

beforeEach(() => {
  lignes = [];
  console.log = (t) => lignes.push({ canal: "log", t });
  console.warn = (t) => lignes.push({ canal: "warn", t });
  console.error = (t) => lignes.push({ canal: "error", t });
  delete process.env.LOG_LEVEL;
});
afterEach(() => {
  Object.assign(console, orig);
  if (niveauInitial === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = niveauInitial;
});

test("une ligne JSON avec niveau, type, date et champs", () => {
  log.warn("requete", { requestId: "r1", status: 404 });
  assert.equal(lignes.length, 1);
  assert.equal(lignes[0].canal, "warn");
  const j = JSON.parse(lignes[0].t);
  assert.equal(j.niveau, "warn");
  assert.equal(j.type, "requete");
  assert.equal(j.requestId, "r1");
  assert.equal(j.status, 404);
  assert.ok(!Number.isNaN(Date.parse(j.date)));
});

test("chaque niveau utilise le bon canal", () => {
  process.env.LOG_LEVEL = "debug";
  log.debug("a"); log.info("b"); log.warn("c"); log.error("d");
  assert.deepEqual(lignes.map((l) => l.canal), ["log", "log", "warn", "error"]);
});

test("LOG_LEVEL filtre en dessous du seuil ; debug masqué par défaut", () => {
  log.debug("a");
  assert.equal(lignes.length, 0);
  process.env.LOG_LEVEL = "error";
  log.info("b"); log.warn("c");
  assert.equal(lignes.length, 0);
  log.error("d");
  assert.equal(lignes.length, 1);
});

test("LOG_LEVEL invalide : retombe sur info", () => {
  process.env.LOG_LEVEL = "n'importe quoi";
  log.debug("a"); log.info("b");
  assert.equal(lignes.length, 1);
});

test("un champ réservé ne peut pas écraser niveau ni type... sauf par l'appelant explicite", () => {
  const j = JSON.parse(formaterLigne("info", "t", { extra: 1 }, new Date(0)));
  assert.deepEqual(j, { niveau: "info", type: "t", date: "1970-01-01T00:00:00.000Z", extra: 1 });
});

test("messageErreur : une ligne, bornée, tolère les non-erreurs", () => {
  assert.equal(messageErreur(new Error("a\n  b\tc")), "a b c");
  assert.equal(messageErreur(new Error("x".repeat(500))).length, 200);
  assert.equal(messageErreur("texte"), "texte");
  assert.equal(messageErreur(undefined), "undefined");
});

test("journaliser avec un niveau inconnu : traité comme info", () => {
  journaliser("bizarre", "t");
  assert.equal(lignes[0].canal, "log");
});
