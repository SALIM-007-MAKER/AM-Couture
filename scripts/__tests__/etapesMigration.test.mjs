// Étapes de migration d'un build Vercel : quelles étapes, dans quel ordre, lesquelles bloquent. Aucune base ni build ici :
// l'exécuteur est simulé. Les scénarios sur une vraie base Postgres jetable sont dans migrations-simulation.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideMigration, etapesMigration, executerEtapes } from "../lib/deployPolicy.mjs";

const decisionDe = (env) => decideMigration(env);
const ids = (etapes) => etapes.map((e) => e.id);

// Exécuteur simulé : codes par identifiant d'étape (0 par défaut) ; garde la liste des étapes réellement exécutées.
function simule(codes = {}) {
  const executees = [];
  const executer = (etape) => {
    executees.push(etape.id);
    return etape.id in codes ? codes[etape.id] : 0;
  };
  return { executer, executees };
}

// ─── Quand migre-t-on ? ─────────────────────────────────────────────────────────────────────────────────────

test("prévisualisation : aucune étape de migration, l'exécuteur n'est jamais appelé", () => {
  const etapes = etapesMigration(decisionDe({ VERCEL_ENV: "preview", DIRECT_URL: "postgresql://x" }));
  assert.deepEqual(etapes, []);
  const { executer, executees } = simule();
  const r = executerEtapes(etapes, executer);
  assert.equal(r.ok, true);
  assert.deepEqual(executees, []);
});

test("local (hors Vercel) : aucune étape de migration, même avec une DIRECT_URL", () => {
  assert.deepEqual(etapesMigration(decisionDe({ DIRECT_URL: "postgresql://x" })), []);
});

test("développement Vercel : aucune étape de migration", () => {
  assert.deepEqual(etapesMigration(decisionDe({ VERCEL_ENV: "development", DIRECT_URL: "x" })), []);
});

test("SKIP_MIGRATIONS=1 : aucune étape, même en production", () => {
  const { executer, executees } = simule();
  const etapes = etapesMigration(decisionDe({ VERCEL_ENV: "production", DIRECT_URL: "x", SKIP_MIGRATIONS: "1" }));
  assert.deepEqual(etapes, []);
  assert.equal(executerEtapes(etapes, executer).ok, true);
  assert.deepEqual(executees, []);
});

test("production sans DIRECT_URL : aucune étape (le build s'arrête avant, voir decideMigration)", () => {
  const d = decisionDe({ VERCEL_ENV: "production" });
  assert.ok(d.erreur);
  assert.deepEqual(etapesMigration(d), []);
});

// ─── Production : ordre et caractère bloquant ───────────────────────────────────────────────────────────────────

const PRODUCTION = { VERCEL_ENV: "production", DIRECT_URL: "postgresql://x" };

test("production : état avant (informatif), application (bloquante), vérification finale (bloquante), dans cet ordre", () => {
  const etapes = etapesMigration(decisionDe(PRODUCTION));
  assert.deepEqual(ids(etapes), ["etat-avant", "application", "verification-finale"]);
  assert.deepEqual(etapes.map((e) => e.bloquant), [false, true, true]);
  assert.deepEqual(etapes.map((e) => e.args.slice(-1)[0]), ["status", "deploy", "status"]);
  for (const e of etapes) assert.deepEqual(e.args.slice(0, 2), ["prisma", "migrate"]);
});

test("migrations en attente : `status` renvoie 1 avant l'application, le build continue et réussit (régression du build de production)", () => {
  const { executer, executees } = simule({ "etat-avant": 1 });
  const r = executerEtapes(etapesMigration(decisionDe(PRODUCTION)), executer);
  assert.equal(r.ok, true);
  assert.deepEqual(executees, ["etat-avant", "application", "verification-finale"]);
  assert.deepEqual(r.resultats.map((x) => x.code), [1, 0, 0]);
});

test("migration réussie, base à jour : les trois étapes réussissent", () => {
  const { executer } = simule();
  const r = executerEtapes(etapesMigration(decisionDe(PRODUCTION)), executer);
  assert.equal(r.ok, true);
  assert.equal(r.echec, undefined);
});

test("migration échouée : le build s'arrête à l'application, la vérification finale n'est pas exécutée", () => {
  const { executer, executees } = simule({ "etat-avant": 1, application: 1 });
  const r = executerEtapes(etapesMigration(decisionDe(PRODUCTION)), executer);
  assert.equal(r.ok, false);
  assert.deepEqual(r.echec, { id: "application", code: 1 });
  assert.deepEqual(executees, ["etat-avant", "application"]);
});

test("base inaccessible : `status` informatif échoue (ignoré), `migrate deploy` échoue et arrête le build", () => {
  const { executer, executees } = simule({ "etat-avant": 1, application: 1 });
  const r = executerEtapes(etapesMigration(decisionDe(PRODUCTION)), executer);
  assert.equal(r.ok, false);
  assert.equal(r.echec.id, "application");
  assert.ok(!executees.includes("verification-finale"));
});

test("vérification finale : déploiement réussi mais base pas à jour → le build s'arrête avant la publication", () => {
  const { executer, executees } = simule({ "verification-finale": 1 });
  const r = executerEtapes(etapesMigration(decisionDe(PRODUCTION)), executer);
  assert.equal(r.ok, false);
  assert.deepEqual(r.echec, { id: "verification-finale", code: 1 });
  assert.deepEqual(executees, ["etat-avant", "application", "verification-finale"]);
});

test("processus interrompu (code null ou undefined) : traité comme un échec, jamais comme un succès", () => {
  for (const code of [null, undefined]) {
    const r = executerEtapes(etapesMigration(decisionDe(PRODUCTION)), (e) => (e.id === "application" ? code : 0));
    assert.equal(r.ok, false, `code ${code}`);
    assert.equal(r.echec.id, "application");
  }
});

test("seule l'étape « état avant » est tolérante : toute autre étape en échec arrête le build", () => {
  for (const id of ["application", "verification-finale"]) {
    const r = executerEtapes(etapesMigration(decisionDe(PRODUCTION)), (e) => (e.id === id ? 2 : 0));
    assert.equal(r.ok, false, id);
    assert.equal(r.echec.code, 2);
  }
  assert.equal(executerEtapes(etapesMigration(decisionDe(PRODUCTION)), (e) => (e.id === "etat-avant" ? 2 : 0)).ok, true);
});
