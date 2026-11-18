// Vérification d'email sans service d'envoi, en développement local seulement (lib/lienLocal.js).
// NODE_ENV vaut « test » pendant la suite (preload.js) : chaque test fixe l'environnement dont il a besoin, puis le restaure.
import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin } from "./helpers.js";
import { nettoyerAtelier } from "./concurrence-helpers.js";

const MDP = "Atelier-Test-2026!";

describe("Vérification d'email — lien dans le terminal en local, Resend partout ailleurs", () => {
  let server, baseUrl;
  const emailsCrees = [];
  const ateliersTest = [];
  const appelsResend = [];
  const sortie = [];
  const fetchOriginal = globalThis.fetch;
  const logOriginal = console.log;
  const env = { NODE_ENV: process.env.NODE_ENV, RESEND_API_KEY: process.env.RESEND_API_KEY, PUBLIC_APP_URL: process.env.PUBLIC_APP_URL };

  const fixerEnv = (nodeEnv, cleResend) => {
    process.env.NODE_ENV = nodeEnv;
    if (cleResend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = cleResend;
    delete process.env.PUBLIC_APP_URL;
  };

  before(async () => {
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith("https://api.resend.com")) {
        appelsResend.push(String(url));
        return new Response(JSON.stringify({ id: "email_test" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return fetchOriginal(url, init);
    };
    console.log = (...args) => {
      sortie.push(args.join(" "));
      logOriginal(...args);
    };
    ({ server, baseUrl } = await demarrerServeur());
  });

  afterEach(() => {
    for (const [cle, valeur] of Object.entries(env)) {
      if (valeur === undefined) delete process.env[cle];
      else process.env[cle] = valeur;
    }
    appelsResend.length = 0;
    sortie.length = 0;
  });

  after(async () => {
    globalThis.fetch = fetchOriginal;
    console.log = logOriginal;
    await arreterServeur(server);
    for (const email of emailsCrees) {
      const u = await prisma.user.findUnique({ where: { email } });
      if (u?.atelierId) {
        await prisma.tokenAction.deleteMany({ where: { userId: u.id } });
        await nettoyerAtelier(u.atelierId, [u.id]);
      }
    }
    for (const { atelier, admin } of ateliersTest) {
      await prisma.tokenAction.deleteMany({ where: { userId: admin.id } });
      await nettoyerAtelier(atelier.id, [admin.id]);
    }
    await prisma.$disconnect();
  });

  const lienAffiche = () => {
    const m = sortie.join("\n").match(/https?:\/\/\S+\/verifier-email\?token=([0-9a-f]{64})/);
    return m ? { lien: m[0], token: m[1] } : null;
  };
  const inscrire = (email) =>
    client(baseUrl).post("/api/auth/inscription-atelier", {
      prenom: "Awa", nomProprietaire: "Diop", email, adminPassword: MDP, telephone: "+22790123456", ville: "Niamey", pays: "Niger",
    });
  const emailUnique = (p) => {
    const email = `${p}-${process.pid}-${Date.now()}@example.test`;
    emailsCrees.push(email);
    return email;
  };
  async function connecteSansEmailVerifie() {
    const compte = await creerAtelierEtAdmin({ nom: "Atelier Verif Locale", password: MDP });
    ateliersTest.push(compte);
    await prisma.user.update({ where: { id: compte.admin.id }, data: { email: `renvoi-${process.pid}-${Date.now()}@example.test`, prenom: "Awa" } });
    const api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant: compte.identifiant, password: MDP })).status, 200);
    return { api, compte };
  }

  it("local : l'inscription affiche le lien dans le terminal, sans email ni jeton dans la réponse", async () => {
    fixerEnv("development", undefined);
    const email = emailUnique("local");
    const r = await inscrire(email);
    assert.equal(r.status, 201);
    assert.ok(!JSON.stringify(r.body).match(/[0-9a-f]{64}/), "aucun jeton dans la réponse HTTP");
    assert.ok(!("lien" in r.body) && !("lienVerification" in r.body));
    assert.equal(appelsResend.length, 0, "aucun appel à Resend en local");
    const trouve = lienAffiche();
    assert.ok(trouve, "le lien doit apparaître dans la sortie du terminal");

    // le lien est réellement valable : il vérifie l'email, une seule fois
    fixerEnv("test", "re_test_stub_key");
    const ok = await client(baseUrl).get(`/api/auth/verifier-email?token=${trouve.token}`);
    assert.equal(ok.status, 200);
    assert.ok((await prisma.user.findUnique({ where: { email } })).emailVerifieLe);
    assert.equal((await client(baseUrl).get(`/api/auth/verifier-email?token=${trouve.token}`)).status, 400, "jeton à usage unique");
  });

  it("local : le renvoi affiche un nouveau lien, valable, sans jeton dans la réponse", async () => {
    const { api, compte } = await connecteSansEmailVerifie();
    fixerEnv("development", undefined);
    const r = await api.post("/api/auth/renvoyer-verification-email", {});
    assert.equal(r.status, 200);
    assert.ok(!JSON.stringify(r.body).match(/[0-9a-f]{64}/));
    assert.equal(appelsResend.length, 0);
    const trouve = lienAffiche();
    assert.ok(trouve);
    fixerEnv("test", "re_test_stub_key");
    assert.equal((await client(baseUrl).get(`/api/auth/verifier-email?token=${trouve.token}`)).status, 200);
    assert.ok((await prisma.user.findUnique({ where: { id: compte.admin.id } })).emailVerifieLe);
  });

  it("local : le jeton affiché expire comme un jeton envoyé par email", async () => {
    const { api, compte } = await connecteSansEmailVerifie();
    fixerEnv("development", undefined);
    assert.equal((await api.post("/api/auth/renvoyer-verification-email", {})).status, 200);
    const { token } = lienAffiche();
    await prisma.tokenAction.updateMany({ where: { userId: compte.admin.id }, data: { expireLe: new Date(Date.now() - 1000) } });
    fixerEnv("test", "re_test_stub_key");
    assert.equal((await client(baseUrl).get(`/api/auth/verifier-email?token=${token}`)).status, 400);
    assert.equal((await prisma.user.findUnique({ where: { id: compte.admin.id } })).emailVerifieLe, null);
  });

  it("production sans clé Resend : aucun lien affiché, le renvoi échoue en 502 et l'email reste non vérifié", async () => {
    const { api, compte } = await connecteSansEmailVerifie();
    fixerEnv("production", undefined);
    const r = await api.post("/api/auth/renvoyer-verification-email", {});
    assert.equal(r.status, 502);
    assert.match(r.body.error, /RESEND_API_KEY manquant/);
    assert.equal(lienAffiche(), null, "jamais de lien dans la sortie en production");
    assert.ok(!sortie.join("\n").includes("[DEV LOCAL]"));
    assert.equal((await prisma.user.findUnique({ where: { id: compte.admin.id } })).emailVerifieLe, null);
  });

  it("production sans clé : l'inscription réussit mais n'affiche aucun lien ; sans jeton valide, la vérification est refusée", async () => {
    fixerEnv("production", undefined);
    const email = emailUnique("prod");
    assert.equal((await inscrire(email)).status, 201);
    assert.equal(lienAffiche(), null);
    assert.equal((await prisma.user.findUnique({ where: { email } })).emailVerifieLe, null);
    fixerEnv("test", "re_test_stub_key");
    const faux = "0".repeat(64);
    assert.equal((await client(baseUrl).get(`/api/auth/verifier-email?token=${faux}`)).status, 400);
    assert.equal((await client(baseUrl).get("/api/auth/verifier-email")).status, 400);
  });

  it("clé Resend présente, même en développement : l'email part par Resend et aucun lien n'est affiché", async () => {
    const { api } = await connecteSansEmailVerifie();
    fixerEnv("development", "re_test_stub_key");
    const r = await api.post("/api/auth/renvoyer-verification-email", {});
    assert.equal(r.status, 200);
    assert.equal(appelsResend.length, 1);
    assert.equal(lienAffiche(), null);
  });
});
