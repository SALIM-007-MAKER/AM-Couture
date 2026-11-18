// Textes produits par le serveur dans la langue de la personne (7.7) : fil d'activité composé à la lecture, PDF, courriels.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { texteDuPdf } from "../lib/__tests__/pdfTexte.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, creerCliente, creerEtActiverClient, supprimerAtelier } from "./helpers.js";

const marque = `${process.pid}-${Date.now()}`;

describe("Messages serveur multilingues", () => {
  let server, baseUrl, A, pdg, pdgLogin, cliente, compte, apiCliente, commande;
  const envoyes = [];
  const fetchOriginal = globalThis.fetch;
  const cleAvant = process.env.RESEND_API_KEY;

  const connecter = async (c) => {
    const api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant: c.identifiant, password: c.password })).status, 200);
    return api;
  };
  const messages = async () => (await apiCliente.get("/api/moi/notifications")).body.data.filter((n) => n.source === "evenement").map((n) => n.message);
  const pdfTexte = async (api, chemin) => {
    const res = await fetch(`${baseUrl}${chemin}`, { headers: { Cookie: api.cookie() } });
    assert.equal(res.status, 200);
    return texteDuPdf(Buffer.from(await res.arrayBuffer()));
  };

  before(async () => {
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith("https://api.resend.com")) {
        envoyes.push({ body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ id: "email_test" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return fetchOriginal(url, init);
    };
    ({ server, baseUrl } = await demarrerServeur());
    const ra = await creerAtelierEtAdmin({ nom: "Atelier Langues" });
    A = ra.atelier;
    pdgLogin = ra;
    pdg = await connecter(ra);
    cliente = await creerCliente(A.id, { nom: "Diop", prenom: "Awa", telephone: `95${Date.now().toString().slice(-6)}`, email: `awa-${marque}@exemple.test` });
    compte = await creerEtActiverClient(A.id, cliente.id);
    await prisma.mesure.create({ data: { clienteId: cliente.id, taille: "70" } });
    apiCliente = await connecter(compte);
    const dans7 = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const r = await pdg.post("/api/commandes", { clienteId: cliente.id, typeVetement: "ROBE", prixTotal: 20000, dateLivraisonPrevue: dans7 });
    assert.equal(r.status, 201);
    commande = r.body;
  });
  beforeEach(() => {
    envoyes.length = 0;
    process.env.RESEND_API_KEY = "re_test_stub_key";
  });
  after(async () => {
    globalThis.fetch = fetchOriginal;
    if (cleAvant === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = cleAvant;
    await arreterServeur(server);
    await supprimerAtelier(A.id);
    await prisma.$disconnect();
  });

  it("le fil d'activité enregistre un code et des paramètres, et se lit dans la langue de la cliente", async () => {
    const ligne = await prisma.notificationClient.findFirst({ where: { clienteId: cliente.id, type: "COMMANDE_CREEE" } });
    assert.equal(ligne.code, "COMMANDE_CREEE");
    assert.deepEqual(ligne.params, { numero: commande.numero });
    assert.equal(ligne.message, `Votre commande ${commande.numero} a été enregistrée.`); // texte français conservé

    assert.ok((await messages()).includes(`Votre commande ${commande.numero} a été enregistrée.`));
    await prisma.user.update({ where: { id: compte.user.id }, data: { langue: "en" } });
    assert.ok((await messages()).includes(`Your order ${commande.numero} has been recorded.`), "la MÊME ligne se lit en anglais");
    await prisma.user.update({ where: { id: compte.user.id }, data: { langue: "de" } });
    assert.ok((await messages()).includes(`Votre commande ${commande.numero} a été enregistrée.`), "langue sans traduction : français");
  });

  it("changement de statut : le libellé du statut est traduit aussi", async () => {
    await prisma.user.update({ where: { id: compte.user.id }, data: { langue: "en" } });
    assert.equal((await pdg.post(`/api/commandes/${commande.id}/statut`, { statut: "EN_CONFECTION" })).status, 200);
    assert.ok((await messages()).includes(`Your order ${commande.numero} is now: In production.`));
    await prisma.user.update({ where: { id: compte.user.id }, data: { langue: "fr" } });
    assert.ok((await messages()).includes(`Votre commande ${commande.numero} est maintenant : En confection.`));
  });

  it("une ligne antérieure à 7.7 (sans code) garde son texte, dans toutes les langues", async () => {
    await prisma.notificationClient.create({ data: { clienteId: cliente.id, type: "RECU_EMIS", message: "Texte ancien figé" } });
    await prisma.user.update({ where: { id: compte.user.id }, data: { langue: "en" } });
    assert.ok((await messages()).includes("Texte ancien figé"));
  });

  it("fiche commande PDF : langue du compte, surchargeable par ?langue=, valeur invalide ignorée", async () => {
    await prisma.user.update({ where: { id: pdgLogin.admin.id }, data: { langue: "fr" } });
    assert.match(await pdfTexte(pdg, `/api/commandes/${commande.id}/fiche-pdf`), /COMMANDE N°/);
    assert.match(await pdfTexte(pdg, `/api/commandes/${commande.id}/fiche-pdf?langue=en`), /ORDER NO\./);
    assert.match(await pdfTexte(pdg, `/api/commandes/${commande.id}/fiche-pdf?langue=xx`), /COMMANDE N°/);
    await prisma.user.update({ where: { id: pdgLogin.admin.id }, data: { langue: "en" } });
    assert.match(await pdfTexte(pdg, `/api/commandes/${commande.id}/fiche-pdf`), /ORDER NO\./);
  });

  it("courriel de réinitialisation : sujet et corps dans la langue du compte", async () => {
    const email = `pdg-${marque}@exemple.test`;
    await prisma.user.update({ where: { id: pdgLogin.admin.id }, data: { email, langue: "en" } });
    const anonyme = client(baseUrl);
    assert.equal((await anonyme.post("/api/auth/mot-de-passe-oublie", { identifiant: pdgLogin.identifiant })).status, 200);
    assert.equal(envoyes.length, 1);
    assert.equal(envoyes[0].body.subject, "Reset your password — Gestion d'Atelier");
    assert.match(envoyes[0].body.html, /Reset my password/);
    await prisma.user.update({ where: { id: pdgLogin.admin.id }, data: { langue: "fr" } });
    envoyes.length = 0;
    assert.equal((await client(baseUrl).post("/api/auth/mot-de-passe-oublie", { identifiant: pdgLogin.identifiant })).status, 200);
    assert.equal(envoyes[0].body.subject, "Réinitialisation de votre mot de passe — Gestion d'Atelier");
  });

  it("invitation d'une cliente : langue de la personne qui invite", async () => {
    await prisma.user.update({ where: { id: pdgLogin.admin.id }, data: { langue: "en" } });
    const c2 = await creerCliente(A.id, { nom: "Invitee", prenom: "Eng", telephone: `94${Date.now().toString().slice(-6)}`, email: `inv-${marque}@exemple.test` });
    const r = await pdg.post(`/api/clientes/${c2.id}/inviter`);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(envoyes.at(-1).body.subject, "Create your client account — Gestion d'Atelier");
  });
});
