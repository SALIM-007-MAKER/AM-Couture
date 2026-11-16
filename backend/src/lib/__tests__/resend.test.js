// Sous-phase 3.2 — l'appel à Resend ne doit jamais bloquer indéfiniment la requête (ni le cron).
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { envoyerEmail } from "../resend.js";

const fetchOriginal = globalThis.fetch;
const env = { cle: process.env.RESEND_API_KEY, delai: process.env.RESEND_TIMEOUT_MS };

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_stub";
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  if (env.cle === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = env.cle;
  if (env.delai === undefined) delete process.env.RESEND_TIMEOUT_MS; else process.env.RESEND_TIMEOUT_MS = env.delai;
});

/** fetch factice qui ne répond jamais, mais respecte l'AbortSignal comme le vrai fetch. */
function fetchSuspendu() {
  return (url, init) =>
    new Promise((resolve, reject) => {
      // Un vrai fetch garde un socket ouvert (donc la boucle d'événements vivante) ; le minuteur
      // d'AbortSignal.timeout, lui, ne la retient pas. Ce minuteur simule le socket.
      const socket = setTimeout(() => {}, 10_000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(socket);
        reject(init.signal.reason ?? new DOMException("annulé", "AbortError"));
      });
    });
}

test("un service Resend qui ne répond pas : l'envoi échoue après le délai configuré, avec un message explicite", { timeout: 5000 }, async () => {
  process.env.RESEND_TIMEOUT_MS = "80";
  globalThis.fetch = fetchSuspendu();
  const t0 = Date.now();
  await assert.rejects(() => envoyerEmail({ to: "a@b.test", subject: "s", html: "<p>x</p>" }), /délai|Resend/i);
  assert.ok(Date.now() - t0 < 2000, `l'échec doit survenir vers 80 ms, pas après ${Date.now() - t0} ms`);
});

test("un envoi qui aboutit n'est pas affecté par le délai", async () => {
  process.env.RESEND_TIMEOUT_MS = "500";
  let signalRecu = null;
  globalThis.fetch = async (url, init) => {
    signalRecu = init.signal;
    return new Response(JSON.stringify({ id: "email_1" }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const r = await envoyerEmail({ to: "a@b.test", subject: "s", html: "<p>x</p>" });
  assert.equal(r.id, "email_1");
  assert.ok(signalRecu, "un AbortSignal doit être transmis à fetch");
});

test("délai par défaut raisonnable quand RESEND_TIMEOUT_MS est absent ou invalide", async () => {
  for (const valeur of [undefined, "", "abc", "-5", "0"]) {
    if (valeur === undefined) delete process.env.RESEND_TIMEOUT_MS; else process.env.RESEND_TIMEOUT_MS = valeur;
    let signal;
    globalThis.fetch = async (url, init) => { signal = init.signal; return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }); };
    await envoyerEmail({ to: "a@b.test", subject: "s", html: "x" });
    assert.ok(signal && !signal.aborted, `valeur ${JSON.stringify(valeur)} : signal actif attendu`);
  }
});

test("la clé absente échoue toujours explicitement, sans appel réseau", async () => {
  delete process.env.RESEND_API_KEY;
  let appele = false;
  globalThis.fetch = async () => { appele = true; return new Response("{}"); };
  await assert.rejects(() => envoyerEmail({ to: "a@b.test", subject: "s", html: "x" }), /RESEND_API_KEY manquant/);
  assert.equal(appele, false);
});

test("une erreur HTTP de Resend conserve son message", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "domain is not verified" }), { status: 403, headers: { "Content-Type": "application/json" } });
  await assert.rejects(() => envoyerEmail({ to: "a@b.test", subject: "s", html: "x" }), /domain is not verified/);
});
