import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "../apiClient.js";

const fetchOrigine = globalThis.fetch;
const timeoutOrigine = AbortSignal.timeout;
afterEach(() => {
  globalThis.fetch = fetchOrigine;
  AbortSignal.timeout = timeoutOrigine;
});

const reponse = (status, corps, entetes = {}) =>
  new Response(corps === undefined ? null : typeof corps === "string" ? corps : JSON.stringify(corps), { status, headers: entetes });

async function erreurDe(promesse) {
  try {
    await promesse;
  } catch (e) {
    return e;
  }
  assert.fail("une erreur était attendue");
}

test("succès : renvoie le JSON", async () => {
  globalThis.fetch = async () => reponse(200, { ok: 1 });
  assert.deepEqual(await api.get("/x"), { ok: 1 });
});

test("coupure réseau (fetch rejette) → ApiError network, status 0", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  const e = await erreurDe(api.get("/x"));
  assert.ok(e instanceof ApiError);
  assert.equal(e.kind, "network");
  assert.equal(e.status, 0);
});

test("délai dépassé → ApiError timeout", async () => {
  // Signal de délai déjà expiré : évite d'attendre 40 s.
  AbortSignal.timeout = () => AbortSignal.abort(new DOMException("timeout", "TimeoutError"));
  globalThis.fetch = async (_url, { signal }) => {
    throw signal.reason;
  };
  const e = await erreurDe(api.get("/x"));
  assert.ok(e instanceof ApiError);
  assert.equal(e.kind, "timeout");
});

test("annulation voulue par l'appelant : l'erreur d'origine est relancée, pas une panne", async () => {
  const ctrl = new AbortController();
  globalThis.fetch = async (_url, { signal }) => {
    ctrl.abort();
    throw signal.reason;
  };
  const e = await erreurDe(api.get("/x", { signal: ctrl.signal }));
  assert.ok(!(e instanceof ApiError));
});

test("503 JSON : kind unavailable, requestId et Retry-After conservés", async () => {
  globalThis.fetch = async () => reponse(503, { error: "Service temporairement indisponible." }, { "X-Request-Id": "rid-9", "Retry-After": "5" });
  const e = await erreurDe(api.get("/x"));
  assert.equal(e.kind, "unavailable");
  assert.equal(e.requestId, "rid-9");
  assert.equal(e.retryAfter, 5);
});

test("500 avec requestId dans le corps", async () => {
  globalThis.fetch = async () => reponse(500, { error: "Une erreur est survenue.", requestId: "rid-corps" });
  assert.equal((await erreurDe(api.get("/x"))).requestId, "rid-corps");
});

test("502 avec corps HTML (passerelle) : ApiError server, pas d'exception de parsing", async () => {
  globalThis.fetch = async () => reponse(502, "<html>Bad gateway</html>");
  const e = await erreurDe(api.get("/x"));
  assert.ok(e instanceof ApiError);
  assert.equal(e.kind, "server");
});

test("400 de validation : details conservés", async () => {
  globalThis.fetch = async () => reponse(400, { error: "Données invalides.", details: { nom: ["requis"] } });
  const e = await erreurDe(api.post("/x", { a: 1 }));
  assert.deepEqual(e.details, { nom: ["requis"] });
  assert.equal(e.kind, "client");
});

test("402 lecture seule : l'écriture est refusée avec le message du serveur, sans redirection vers l'abonnement", async () => {
  const { useAbonnementStore } = await import("../../stores/abonnementStore.js");
  useAbonnementStore.getState().setBloque(false);
  globalThis.fetch = async () =>
    reponse(402, { error: "Votre abonnement est terminé : lecture seule.", details: { essaiExpire: true, lectureSeule: true } });
  const e = await erreurDe(api.post("/clientes", {}));
  assert.equal(e.status, 402);
  assert.match(e.message, /lecture seule/);
  assert.equal(useAbonnementStore.getState().bloque, false);
});

test("402 sans lecture seule (ancien comportement) : signale le blocage", async () => {
  const { useAbonnementStore } = await import("../../stores/abonnementStore.js");
  useAbonnementStore.getState().setBloque(false);
  globalThis.fetch = async () => reponse(402, { error: "Essai terminé.", details: { essaiExpire: true } });
  await erreurDe(api.get("/clientes"));
  assert.equal(useAbonnementStore.getState().bloque, true);
  useAbonnementStore.getState().setBloque(false);
});

test("204 : renvoie null", async () => {
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await api.delete("/x"), null);
});
