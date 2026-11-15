import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { requestLog, seuilLentMs } from "../requestLog.middleware.js";

const orig = { log: console.log, warn: console.warn, error: console.error };
const env0 = { ...process.env };
let lignes;

beforeEach(() => {
  lignes = [];
  console.log = (t) => lignes.push({ canal: "log", j: JSON.parse(t) });
  console.warn = (t) => lignes.push({ canal: "warn", j: JSON.parse(t) });
  console.error = () => {};
  process.env.LOG_REQUETES = "1";
  delete process.env.LOG_SEUIL_LENT_MS;
  delete process.env.LOG_LEVEL;
});
afterEach(() => {
  Object.assign(console, orig);
  for (const k of ["LOG_REQUETES", "LOG_SEUIL_LENT_MS", "LOG_LEVEL"]) {
    if (env0[k] === undefined) delete process.env[k]; else process.env[k] = env0[k];
  }
});

function requete(extra = {}) {
  const res = new EventEmitter();
  Object.assign(res, { statusCode: 200, writableFinished: true });
  const req = { id: "rid-1", method: "GET", originalUrl: "/api/clientes?token=SECRET&q=1", baseUrl: "/api/clientes", route: { path: "/" }, ...extra };
  return { req, res };
}
const passer = (req, res) => { let suivi = false; requestLog(req, res, () => { suivi = true; }); assert.ok(suivi, "next() doit être appelé"); };

test("une ligne par requête : référence, route, statut, durée ; JAMAIS la query-string", () => {
  const { req, res } = requete({ user: { id: "u1", atelierId: "a1", role: "ADMIN" } });
  passer(req, res); res.emit("close");
  assert.equal(lignes.length, 1);
  const { canal, j } = lignes[0];
  assert.equal(canal, "log");
  assert.equal(j.type, "requete");
  assert.equal(j.requestId, "rid-1");
  assert.equal(j.chemin, "/api/clientes");
  assert.equal(j.route, "/api/clientes/");
  assert.equal(j.status, 200);
  assert.equal(typeof j.dureeMs, "number");
  assert.deepEqual([j.userId, j.atelierId, j.role], ["u1", "a1", "ADMIN"]);
  assert.ok(!JSON.stringify(j).includes("SECRET"));
});

test("5xx : niveau warn", () => {
  const { req, res } = requete(); res.statusCode = 500;
  passer(req, res); res.emit("close");
  assert.equal(lignes[0].canal, "warn");
});

test("4xx attendu : niveau info", () => {
  const { req, res } = requete(); res.statusCode = 404;
  passer(req, res); res.emit("close");
  assert.equal(lignes[0].canal, "log");
});

test("requête lente : warn + lent:true (seuil configurable)", async () => {
  process.env.LOG_SEUIL_LENT_MS = "5";
  const { req, res } = requete();
  passer(req, res);
  await new Promise((r) => setTimeout(r, 25));
  res.emit("close");
  assert.equal(lignes[0].canal, "warn");
  assert.equal(lignes[0].j.lent, true);
});

test("connexion coupée par le client : interrompue:true", () => {
  const { req, res } = requete(); res.writableFinished = false;
  passer(req, res); res.emit("close");
  assert.equal(lignes[0].j.interrompue, true);
  assert.equal(lignes[0].canal, "warn");
});

test("sonde de santé réussie : pas de ligne ; en échec : ligne", () => {
  let { req, res } = requete({ originalUrl: "/api/health/ready" });
  passer(req, res); res.emit("close");
  assert.equal(lignes.length, 0);
  ({ req, res } = requete({ originalUrl: "/api/health/ready" })); res.statusCode = 503;
  passer(req, res); res.emit("close");
  assert.equal(lignes.length, 1);
});

test("LOG_REQUETES=0 : désactivé ; en test, désactivé par défaut", () => {
  process.env.LOG_REQUETES = "0";
  let { req, res } = requete(); passer(req, res); res.emit("close");
  delete process.env.LOG_REQUETES; process.env.NODE_ENV = "test";
  ({ req, res } = requete()); passer(req, res); res.emit("close");
  assert.equal(lignes.length, 0);
});

test("seuilLentMs : valeur invalide → 1000", () => {
  assert.equal(seuilLentMs({ LOG_SEUIL_LENT_MS: "abc" }), 1000);
  assert.equal(seuilLentMs({ LOG_SEUIL_LENT_MS: "-3" }), 1000);
  assert.equal(seuilLentMs({ LOG_SEUIL_LENT_MS: "250" }), 250);
});
