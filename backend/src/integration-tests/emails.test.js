// Envoi d'emails (Resend) en environnement de TEST : aucun appel réseau réel.
// `fetch` est intercepté UNIQUEMENT pour api.resend.com (les requêtes vers le
// serveur de test local passent normalement) — les emails sont capturés et
// leurs liens rejoués contre l'API réelle.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";

const MDP = "Atelier-Test-2026!";
const NOUVEAU = "Nouveau-Mdp-Couture-2026!";

describe("Emails — flux mot de passe oublié / vérification, avec Resend simulé", () => {
  let server, baseUrl, atelier, admin, identifiant, emailAdmin;
  const envoyes = [];
  let reponseResend = { status: 200, body: { id: "email_test" } };
  const fetchOriginal = globalThis.fetch;
  const cleAvant = process.env.RESEND_API_KEY;
  const urlAvant = process.env.PUBLIC_APP_URL;

  before(async () => {
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith("https://api.resend.com")) {
        envoyes.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
        return new Response(JSON.stringify(reponseResend.body), {
          status: reponseResend.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      return fetchOriginal(url, init);
    };
    ({ server, baseUrl } = await demarrerServeur());
    ({ atelier, admin, identifiant } = await creerAtelierEtAdmin({ nom: "Atelier Emails", password: MDP }));
    emailAdmin = `admin-${process.pid}-${Date.now()}@example.test`;
    await prisma.user.update({ where: { id: admin.id }, data: { email: emailAdmin, prenom: "Awa" } });
  });

  beforeEach(() => {
    envoyes.length = 0;
    reponseResend = { status: 200, body: { id: "email_test" } };
    process.env.RESEND_API_KEY = "re_test_stub_key";
    delete process.env.PUBLIC_APP_URL;
  });

  after(async () => {
    globalThis.fetch = fetchOriginal;
    if (cleAvant === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = cleAvant;
    if (urlAvant === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = urlAvant;
    await arreterServeur(server);
    await prisma.tokenAction.deleteMany({ where: { userId: admin.id } });
    await prisma.journalSecurite.deleteMany({ where: { atelierId: atelier.id } });
    await supprimerAtelier(atelier.id);
    await prisma.$disconnect();
  });

  function lienDe(email) {
    const m = email.body.html.match(/href="([^"]+)"/);
    assert.ok(m, "le lien doit être présent dans l'email");
    return new URL(m[1]);
  }

  it("mot de passe oublié : requête Resend conforme, lien fonctionnel, sessions révoquées, jeton à usage unique", async () => {
    const ancienne = client(baseUrl);
    assert.equal((await ancienne.post("/api/auth/login", { identifiant, password: MDP })).status, 200);

    const r = await client(baseUrl).post("/api/auth/mot-de-passe-oublie", { identifiant });
    assert.equal(r.status, 200);
    assert.equal(envoyes.length, 1);
    const [mail] = envoyes;
    assert.equal(mail.url, "https://api.resend.com/emails");
    assert.equal(mail.headers.Authorization, "Bearer re_test_stub_key");
    assert.equal(mail.body.to, emailAdmin);
    assert.match(mail.body.from, /<onboarding@resend\.dev>$/);
    assert.match(mail.body.subject, /Réinitialisation/);

    const lien = lienDe(mail);
    assert.equal(lien.pathname, "/reinitialiser-mot-de-passe");
    const token = lien.searchParams.get("token");
    assert.match(token, /^[0-9a-f]{64}$/);

    const reset = await client(baseUrl).post("/api/auth/reinitialiser-mot-de-passe-token", { token, nouveauMotDePasse: NOUVEAU });
    assert.equal(reset.status, 204);
    assert.equal((await client(baseUrl).post("/api/auth/login", { identifiant, password: NOUVEAU })).status, 200);
    assert.equal((await client(baseUrl).post("/api/auth/login", { identifiant, password: MDP })).status, 401);
    assert.equal((await ancienne.get("/api/auth/me")).status, 401, "l'ancienne session doit être révoquée");

    const rejeu = await client(baseUrl).post("/api/auth/reinitialiser-mot-de-passe-token", { token, nouveauMotDePasse: "Autre-Mdp-Couture-2026!" });
    assert.equal(rejeu.status, 400);
    await prisma.user.update({ where: { id: admin.id }, data: { sessionVersion: { increment: 1 } } });
  });

  it("mot de passe oublié : réponse identique pour un compte inconnu, et aucun email envoyé", async () => {
    const inconnu = await client(baseUrl).post("/api/auth/mot-de-passe-oublie", { identifiant: `inexistant-${process.pid}-${Date.now()}` });
    const connu = await client(baseUrl).post("/api/auth/mot-de-passe-oublie", { identifiant });
    assert.equal(inconnu.status, 200);
    assert.deepEqual(inconnu.body, connu.body);
    assert.equal(envoyes.length, 1, "seul le compte existant reçoit un email");
  });

  it("échec Resend (domaine non vérifié) : mot de passe oublié reste générique (200)", async () => {
    reponseResend = { status: 403, body: { message: "domain is not verified" } };
    const r = await client(baseUrl).post("/api/auth/mot-de-passe-oublie", { identifiant });
    assert.equal(r.status, 200);
  });

  it("renvoi de vérification : 502 explicite si Resend refuse ou si la clé est absente", async () => {
    const api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant, password: NOUVEAU })).status, 200);

    reponseResend = { status: 422, body: { message: "invalid from address" } };
    const refuse = await api.post("/api/auth/renvoyer-verification-email", {});
    assert.equal(refuse.status, 502);
    assert.match(refuse.body.error, /invalid from address/);

    delete process.env.RESEND_API_KEY;
    const sansCle = await api.post("/api/auth/renvoyer-verification-email", {});
    assert.equal(sansCle.status, 502);
    assert.match(sansCle.body.error, /RESEND_API_KEY manquant/);
    assert.equal(envoyes.length, 1, "sans clé, aucun appel réseau n'est tenté");
  });

  it("renvoi de vérification : l'email part avec un lien de vérification valide", async () => {
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant, password: NOUVEAU });
    const r = await api.post("/api/auth/renvoyer-verification-email", {});
    assert.equal(r.status, 200);
    assert.equal(envoyes.length, 1, "un seul email par demande de renvoi (jamais de double envoi)");
    const lien = lienDe(envoyes[0]);
    const ok = await fetch(`${baseUrl}/api/auth/verifier-email?token=${lien.searchParams.get("token")}`);
    assert.ok(ok.status < 400, `vérification : HTTP ${ok.status}`);
  });

  // En-tête Host forgé : sans origine publique configurée, le lien suivrait le
  // Host reçu. Node/undici refuse de poser Host via fetch : requête http brute.
  function postBrut(hote, chemin, corps) {
    return new Promise((resolve, reject) => {
      const u = new URL(baseUrl);
      const req = http.request(
        { host: u.hostname, port: u.port, path: chemin, method: "POST", headers: { Host: hote, "Content-Type": "application/json", "X-Forwarded-For": `203.0.113.${200 + (process.pid % 50)}` } },
        (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); },
      );
      req.on("error", reject);
      req.end(JSON.stringify(corps));
    });
  }

  it("lien de l'email : PUBLIC_APP_URL prime sur un en-tête Host forgé", async () => {
    process.env.PUBLIC_APP_URL = "https://app.exemple-atelier.test";
    assert.equal(await postBrut("evil.example", "/api/auth/mot-de-passe-oublie", { identifiant }), 200);
    assert.equal(envoyes.length, 1);
    assert.equal(lienDe(envoyes[0]).origin, "https://app.exemple-atelier.test");
  });
});
