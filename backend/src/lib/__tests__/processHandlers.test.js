// Sous-phase 3.2 — rejets et exceptions non gérés : toujours journalisés avec le même format
// structuré que les erreurs de requête. Le processus est un faux objet : aucun effet réel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { installerGestionnairesProcessus } from "../processHandlers.js";

function fauxProcessus() {
  const p = new EventEmitter();
  p.exitCode = undefined;
  p.sorties = [];
  p.exit = (code) => p.sorties.push(code);
  return p;
}
function capturer(fn) {
  const lignes = [];
  const e = console.error;
  console.error = (...a) => lignes.push(a.join(" "));
  try { fn(); } finally { console.error = e; }
  return lignes;
}

test("un rejet non géré est journalisé (JSON structuré) sans arrêter le processus", () => {
  const p = fauxProcessus();
  installerGestionnairesProcessus(p);
  const lignes = capturer(() => p.emit("unhandledRejection", new Error("rejet perdu")));
  assert.equal(lignes.length, 1);
  const j = JSON.parse(lignes[0]);
  assert.equal(j.type, "erreur");
  assert.equal(j.categorie, "rejet_non_gere");
  assert.match(j.message, /rejet perdu/);
  assert.deepEqual(p.sorties, [], "un rejet isolé ne doit pas tuer l'instance");
});

test("un rejet dont la raison n'est pas une Error (chaîne, objet, undefined) est journalisé sans planter", () => {
  const p = fauxProcessus();
  installerGestionnairesProcessus(p);
  for (const raison of ["texte brut", { code: 1 }, undefined, null]) {
    const lignes = capturer(() => p.emit("unhandledRejection", raison));
    assert.equal(JSON.parse(lignes[0]).categorie, "rejet_non_gere");
  }
});

test("une exception non interceptée est journalisée puis le processus s'arrête (état indéterminé)", async () => {
  const p = fauxProcessus();
  installerGestionnairesProcessus(p);
  const lignes = capturer(() => p.emit("uncaughtException", new Error("catastrophe")));
  assert.equal(JSON.parse(lignes[0]).categorie, "exception_non_geree");
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(p.sorties, [1]);
});

test("l'installation est idempotente : un seul gestionnaire même si appelée plusieurs fois", () => {
  const p = fauxProcessus();
  installerGestionnairesProcessus(p);
  installerGestionnairesProcessus(p);
  installerGestionnairesProcessus(p);
  assert.equal(p.listenerCount("unhandledRejection"), 1);
  assert.equal(p.listenerCount("uncaughtException"), 1);
});

test("aucune donnée sensible : seule la pile technique est journalisée, pas de contexte de requête", () => {
  const p = fauxProcessus();
  installerGestionnairesProcessus(p);
  const lignes = capturer(() => p.emit("unhandledRejection", new Error("échec")));
  const j = JSON.parse(lignes[0]);
  assert.deepEqual(Object.keys(j).sort(), ["categorie", "date", "message", "niveau", "pile", "type"]);
});
