// Sous-phase 3.2 — gestion centralisée des erreurs, de bout en bout à travers un vrai Express
// (mini-application, sans base de données). Vérifie le format des réponses, l'absence de fuite
// d'informations internes, l'identifiant de requête et le contenu des journaux.
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { errorMiddleware, HttpError } from "../error.middleware.js";
import { requestId } from "../requestId.middleware.js";

function erreurPrisma(code, extra = {}) {
  return Object.assign(new Error(`Invalid \`prisma.x()\` invocation: ${code}`), { name: "PrismaClientKnownRequestError", code, ...extra });
}
const adaptateur = (kind, originalCode) => ({ driverAdapterError: { cause: { kind, ...(originalCode ? { originalCode } : {}) } } });

describe("Middleware d'erreurs (mini-application Express)", () => {
  let server, base;
  let logs;
  const ecritures = { error: console.error, warn: console.warn };

  before(async () => {
    const app = express();
    app.use(requestId);
    app.use(express.json({ limit: "1kb" }));
    app.post("/echo", (req, res) => res.json({ ok: true }));
    app.get("/http-409", () => { throw new HttpError(409, "Conflit métier.", { champ: ["détail"] }); });
    app.get("/inconnue", () => { throw new Error("SELECT * FROM \"User\" WHERE password = 'secret-interne'"); });
    app.get("/asynchrone", async () => { throw new Error("rejet asynchrone interne"); });
    app.get("/prisma/:code", (req) => {
      const table = {
        P2002: erreurPrisma("P2002", { meta: { driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: { index: "User_email_key" } } } } }),
        P2003: erreurPrisma("P2003"),
        P2025: erreurPrisma("P2025"),
        P2037: erreurPrisma("P2037", { meta: adaptateur("TooManyConnections", "53300") }),
        P2028: erreurPrisma("P2028"),
        P2034: erreurPrisma("P2034"),
        inaccessible: erreurPrisma("P2010", { meta: adaptateur("DatabaseNotReachable") }),
        deadlock: erreurPrisma("P2010", { meta: adaptateur("TransactionWriteConflict", "40P01") }),
        brute: erreurPrisma("P2010", { meta: adaptateur("UnsupportedNativeDataType") }),
      };
      throw table[req.params.code];
    });
    app.get("/pg/:cas", (req) => {
      const messages = { connexion: "Connection terminated due to connection timeout", requete: "Query read timeout", refuse: "connect ECONNREFUSED 127.0.0.1:5432" };
      throw new Error(messages[req.params.cas]);
    });
    app.use(errorMiddleware);
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((r) => server.close(r)));

  beforeEach(() => {
    logs = [];
    console.error = (...a) => logs.push({ niveau: "error", texte: a.join(" ") });
    console.warn = (...a) => logs.push({ niveau: "warn", texte: a.join(" ") });
  });
  afterEach(() => {
    console.error = ecritures.error;
    console.warn = ecritures.warn;
  });

  const appeler = async (chemin, opts) => {
    const r = await fetch(base + chemin, opts);
    let corps = null;
    try { corps = await r.json(); } catch { /* corps vide */ }
    return { status: r.status, corps, entetes: r.headers };
  };

  it("chaque réponse porte un en-tête X-Request-Id, différent à chaque requête", async () => {
    const a = await appeler("/http-409");
    const b = await appeler("/http-409");
    assert.match(a.entetes.get("x-request-id"), /^[0-9a-f-]{36}$/);
    assert.notEqual(a.entetes.get("x-request-id"), b.entetes.get("x-request-id"));
  });

  it("JSON invalide : 400 en français, sans le texte interne du parseur", async () => {
    const r = await appeler("/echo", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{pas du json" });
    assert.equal(r.status, 400);
    assert.match(r.corps.error, /JSON/);
    assert.doesNotMatch(JSON.stringify(r.corps), /Expected|position|property name|line \d/i);
  });

  it("corps trop volumineux : 413 en français", async () => {
    const r = await appeler("/echo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: "x".repeat(5000) }) });
    assert.equal(r.status, 413);
    assert.match(r.corps.error, /volumineuse/);
    assert.doesNotMatch(JSON.stringify(r.corps), /entity too large/i);
  });

  it("HttpError : statut, message et détails conservés tels quels", async () => {
    const r = await appeler("/http-409");
    assert.equal(r.status, 409);
    assert.deepEqual(r.corps, { error: "Conflit métier.", details: { champ: ["détail"] } });
  });

  it("erreur inconnue : 500 générique, jamais de détail interne, référence de requête fournie", async () => {
    const r = await appeler("/inconnue");
    assert.equal(r.status, 500);
    assert.equal(r.corps.error, "Une erreur est survenue.");
    assert.equal(r.corps.requestId, r.entetes.get("x-request-id"));
    assert.doesNotMatch(JSON.stringify(r.corps), /SELECT|secret-interne|password/);
  });

  it("rejet asynchrone d'une route : traité comme toute autre erreur (500 générique)", async () => {
    const r = await appeler("/asynchrone");
    assert.equal(r.status, 500);
    assert.equal(r.corps.error, "Une erreur est survenue.");
  });

  const cas = [
    ["P2002", 409, null, "violation d'unicité"],
    ["P2003", 409, null, "clé étrangère"],
    ["P2025", 404, null, "enregistrement absent"],
    ["P2034", 409, null, "conflit d'écriture"],
    ["deadlock", 409, null, "deadlock (40P01)"],
    ["P2037", 503, "5", "trop de connexions"],
    ["inaccessible", 503, "5", "base injoignable"],
    ["P2028", 503, "5", "transaction expirée"],
  ];
  for (const [code, statut, retryAfter, libelle] of cas) {
    it(`Prisma ${libelle} → ${statut}${retryAfter ? " avec Retry-After" : ""}, message sûr`, async () => {
      const r = await appeler(`/prisma/${code}`);
      assert.equal(r.status, statut);
      assert.doesNotMatch(JSON.stringify(r.corps), /prisma|invocation|P20\d\d|User_email_key|constraint/i);
      if (retryAfter) {
        assert.equal(r.entetes.get("retry-after"), retryAfter);
        assert.ok(r.corps.requestId, "une référence est fournie pour un 5xx");
        assert.match(r.corps.error, /temporairement|réessayez/i);
      }
    });
  }

  it("erreur Prisma brute non reconnue (P2010 générique) : 500 générique", async () => {
    const r = await appeler("/prisma/brute");
    assert.equal(r.status, 500);
    assert.equal(r.corps.error, "Une erreur est survenue.");
  });

  for (const [cle, libelle] of [["connexion", "délai de connexion"], ["requete", "délai de requête"], ["refuse", "connexion refusée"]]) {
    it(`erreur du pilote pg (${libelle}) → 503 avec Retry-After`, async () => {
      const r = await appeler(`/pg/${cle}`);
      assert.equal(r.status, 503);
      assert.equal(r.entetes.get("retry-after"), "5");
    });
  }

  it("journal d'une erreur 500 : JSON structuré avec référence, chemin SANS query-string, pile, aucun corps", async () => {
    await appeler("/inconnue?token=JETON-SECRET-123&autre=1", { headers: { "X-Test": "x" } });
    const ligne = logs.find((l) => l.niveau === "error");
    assert.ok(ligne, "une ligne error est attendue pour un 500");
    const j = JSON.parse(ligne.texte);
    assert.equal(j.type, "erreur");
    assert.equal(j.status, 500);
    assert.equal(j.chemin, "/inconnue");
    assert.equal(j.methode, "GET");
    assert.ok(j.requestId);
    assert.ok(j.pile, "la pile est conservée pour un 500");
    assert.doesNotMatch(ligne.texte, /JETON-SECRET-123/, "un jeton passé en query-string ne doit jamais être journalisé");
  });

  it("journal d'une erreur 4xx : niveau warn, sans pile", async () => {
    await appeler("/http-409");
    assert.equal(logs.some((l) => l.niveau === "error"), false);
    const ligne = logs.find((l) => l.niveau === "warn");
    assert.ok(ligne);
    const j = JSON.parse(ligne.texte);
    assert.equal(j.status, 409);
    assert.equal(j.pile, undefined);
  });

  it("corps de requête jamais journalisé", async () => {
    await appeler("/echo", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"motDePasse":"Tres-Secret-42"' });
    assert.doesNotMatch(logs.map((l) => l.texte).join("\n"), /Tres-Secret-42/);
  });

  it("réponse déjà envoyée : l'erreur est déléguée à Express (pas de double écriture)", () => {
    let delegue = null;
    errorMiddleware(new Error("tard"), { method: "GET", originalUrl: "/x", id: "r1" }, { headersSent: true }, (e) => { delegue = e; });
    assert.equal(delegue.message, "tard");
  });
});
