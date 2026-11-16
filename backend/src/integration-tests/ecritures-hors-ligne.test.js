// Garanties serveur des écritures rejouées après un passage hors ligne (7.6) : un rejeu ne crée jamais de doublon
// (clé d'idempotence), et l'avance de statut n'est appliquée que sur l'état que l'utilisateur voyait (`statutAttendu`).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, creerCliente, creerCommande, supprimerAtelier } from "./helpers.js";

const H = (cle) => ({ "Idempotency-Key": cle });
const marque = `${process.pid}-${Date.now()}`;

describe("Écritures rejouées hors ligne", () => {
  let server, baseUrl, A, B, pdg, pdgB;
  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const ra = await creerAtelierEtAdmin({ nom: "Atelier Hors-ligne A" });
    const rb = await creerAtelierEtAdmin({ nom: "Atelier Hors-ligne B" });
    A = ra.atelier;
    B = rb.atelier;
    pdg = client(baseUrl);
    assert.equal((await pdg.post("/api/auth/login", { identifiant: ra.identifiant, password: ra.password })).status, 200);
    pdgB = client(baseUrl);
    assert.equal((await pdgB.post("/api/auth/login", { identifiant: rb.identifiant, password: rb.password })).status, 200);
  });
  after(async () => {
    await arreterServeur(server);
    await supprimerAtelier(A.id);
    await supprimerAtelier(B.id);
    await prisma.$disconnect();
  });

  it("créer une cliente deux fois avec la même clé : une seule fiche, la réponse d'origine est rejouée", async () => {
    const corps = { nom: "Hors", prenom: "Ligne", telephone: `97${Date.now().toString().slice(-6)}` };
    const cle = `ofl-cli-${marque}`;
    const r1 = await pdg.post("/api/clientes", corps, H(cle));
    const r2 = await pdg.post("/api/clientes", corps, H(cle));
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    assert.equal(r2.headers.get("idempotent-replay"), "true");
    assert.equal(r2.body.id, r1.body.id);
    assert.equal(await prisma.cliente.count({ where: { atelierId: A.id, telephone: corps.telephone } }), 1);
  });

  it("prise de mesures rejouée avec la même clé : une seule ligne ; sans clé, comportement inchangé", async () => {
    const cliente = await creerCliente(A.id, { nom: "Mes", prenom: "Ure", telephone: `96${Date.now().toString().slice(-6)}` });
    const cle = `ofl-mes-${marque}`;
    const r1 = await pdg.post(`/api/clientes/${cliente.id}/mesures`, { taille: "70" }, H(cle));
    const r2 = await pdg.post(`/api/clientes/${cliente.id}/mesures`, { taille: "70" }, H(cle));
    assert.equal(r1.status, 201);
    assert.equal(r2.headers.get("idempotent-replay"), "true");
    assert.equal(r2.body.id, r1.body.id);
    assert.equal(await prisma.mesure.count({ where: { clienteId: cliente.id } }), 1);
    const sans = await pdg.post(`/api/clientes/${cliente.id}/mesures`, { taille: "71" });
    assert.equal(sans.status, 201); // nouvelle ligne : l'historique s'allonge toujours
    assert.equal(await prisma.mesure.count({ where: { clienteId: cliente.id } }), 2);
  });

  it("la même clé ne rejoue jamais la réponse d'un autre atelier", async () => {
    const cle = `ofl-iso-${marque}`;
    const a = await pdg.post("/api/clientes", { nom: "Iso", prenom: "A", telephone: `95${Date.now().toString().slice(-6)}` }, H(cle));
    const b = await pdgB.post("/api/clientes", { nom: "Iso", prenom: "B", telephone: `94${Date.now().toString().slice(-6)}` }, H(cle));
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal(b.headers.get("idempotent-replay"), null);
    assert.notEqual(a.body.id, b.body.id);
  });

  describe("avance de statut", () => {
    let cliente;
    before(async () => {
      cliente = await creerCliente(A.id, { nom: "Stat", prenom: "Ut", telephone: `93${Date.now().toString().slice(-6)}` });
    });
    const nouvelle = () => creerCommande(A.id, cliente.id, { statut: "NOUVELLE" });

    it("statut conforme à celui que l'utilisateur voyait : appliqué, et rejouable sans effet double", async () => {
      const c = await nouvelle();
      const cle = `ofl-st-${marque}-1`;
      const r1 = await pdg.post(`/api/commandes/${c.id}/statut`, { statut: "EN_CONFECTION", statutAttendu: "NOUVELLE" }, H(cle));
      assert.equal(r1.status, 200);
      const r2 = await pdg.post(`/api/commandes/${c.id}/statut`, { statut: "EN_CONFECTION", statutAttendu: "NOUVELLE" }, H(cle));
      assert.equal(r2.status, 200);
      assert.equal(r2.headers.get("idempotent-replay"), "true");
      assert.equal((await prisma.commande.findUnique({ where: { id: c.id } })).statut, "EN_CONFECTION");
      // Une seule notification pour la cliente : le rejeu n'a rien réécrit.
      assert.equal(await prisma.notificationClient.count({ where: { commandeId: c.id, type: "COMMANDE_STATUT_CHANGE" } }), 1);
    });

    it("statut changé entre-temps : refus 409 STATUT_CHANGE, rien n'est modifié", async () => {
      const c = await nouvelle();
      await prisma.commande.update({ where: { id: c.id }, data: { statut: "EN_CONFECTION" } }); // quelqu'un d'autre a avancé
      const r = await pdg.post(`/api/commandes/${c.id}/statut`, { statut: "EN_CONFECTION", statutAttendu: "NOUVELLE" });
      assert.equal(r.status, 409);
      assert.equal(r.body.details.code, "STATUT_CHANGE");
      assert.equal(r.body.details.statutActuel, "EN_CONFECTION");
      assert.equal(await prisma.notificationClient.count({ where: { commandeId: c.id } }), 0);
    });

    it("sans garde : comportement d'avant inchangé (compatibilité)", async () => {
      const c = await nouvelle();
      assert.equal((await pdg.post(`/api/commandes/${c.id}/statut`, { statut: "EN_CONFECTION" })).status, 200);
    });

    it("garde invalide ou champ inconnu : 400 ; LIVREE reste refusé", async () => {
      const c = await nouvelle();
      assert.equal((await pdg.post(`/api/commandes/${c.id}/statut`, { statut: "EN_CONFECTION", statutAttendu: "N_IMPORTE_QUOI" })).status, 400);
      assert.equal((await pdg.post(`/api/commandes/${c.id}/statut`, { statut: "EN_CONFECTION", force: true })).status, 400);
      assert.equal((await pdg.post(`/api/commandes/${c.id}/statut`, { statut: "LIVREE", statutAttendu: "NOUVELLE" })).status, 409);
    });

    it("une commande d'un autre atelier reste introuvable", async () => {
      const c = await nouvelle();
      const r = await pdgB.post(`/api/commandes/${c.id}/statut`, { statut: "EN_CONFECTION", statutAttendu: "NOUVELLE" }, H(`ofl-st-${marque}-b`));
      assert.equal(r.status, 404);
    });
  });
});
