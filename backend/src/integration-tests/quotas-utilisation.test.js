// Suivi de la consommation des quotas : API de l'atelier (PDG), vues SuperAdmin, aide à la décision avant d'attribuer une
// formule. Base Postgres jetable dédiée (voir preload.js).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, creerCliente, supprimerAtelier } from "./helpers.js";

const marque = `${process.pid}-${Date.now()}`;
const MDP = "Atelier-Test-2026!";
const JOUR = 86_400_000;
let n = 0;
const telephone = () => `8${marque.replace(/\D/g, "").slice(-3)}${String(++n).padStart(4, "0")}`;

describe("Quotas : utilisation et aide à la décision", () => {
  let server, baseUrl, superApi, superId, plan;
  const ateliers = [];

  async function atelier(nom, { abonne = false, essai = false } = {}) {
    const r = await creerAtelierEtAdmin({ nom: `${nom} ${marque}` });
    ateliers.push(r.atelier.id);
    if (abonne || essai) await prisma.atelier.update({ where: { id: r.atelier.id }, data: { trialEndsAt: new Date(Date.now() + (essai ? 10 : -60) * JOUR) } });
    if (abonne) {
      await prisma.abonnement.create({
        data: { numero: `ABN-U-${marque}-${++n}`, atelierId: r.atelier.id, planId: plan.id, planNom: plan.nom, prix: "5000", statut: "CONFIRME", dateDebut: new Date(Date.now() - 5 * JOUR), dateExpiration: new Date(Date.now() + 25 * JOUR), limites: { ...plan.limites, clientes: 4 }, plancher: { clientes: 4 } },
      });
    }
    const api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant: r.identifiant, password: r.password })).status, 200);
    return { ...r, api, id: r.atelier.id };
  }

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const identifiant = `super-quotas-util-${marque}`;
    superId = (await prisma.user.create({ data: { identifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "SUPERADMIN" } })).id;
    superApi = client(baseUrl);
    assert.equal((await superApi.post("/api/auth/login", { identifiant, password: MDP })).status, 200);
    plan = await prisma.planAbonnement.create({ data: { nom: `Util ${marque}`, prixMensuel: "5000", limites: { clientes: 3, employes: 1, commandesActives: 50, modeles: 50 } } });
  });

  after(async () => {
    await arreterServeur(server);
    for (const id of ateliers) {
      await prisma.historiqueAbonnement.deleteMany({ where: { atelierId: id } });
      await prisma.abonnement.deleteMany({ where: { atelierId: id } });
      await prisma.journalSecurite.deleteMany({ where: { atelierId: id } });
      await supprimerAtelier(id);
    }
    await prisma.planAbonnement.delete({ where: { id: plan.id } });
    await prisma.user.delete({ where: { id: superId } });
    await prisma.$disconnect();
  });

  it("le PDG voit une jauge par ressource avec la formule et la raison ; le plancher est signalé", async () => {
    const a = await atelier("Jauges", { abonne: true });
    for (let i = 0; i < 4; i++) await creerCliente(a.id, { telephone: telephone() });
    const res = await a.api.get("/api/abonnements/utilisation");
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.quotasAppliques, true);
    assert.equal(res.body.raison, "ABONNEMENT");
    assert.equal(res.body.formule, plan.nom);
    assert.deepEqual(res.body.jauges.map((j) => j.cle), ["clientes", "employes", "commandesActives", "modeles"]);
    const clientes = res.body.jauges[0];
    assert.deepEqual(clientes, { cle: "clientes", usage: 4, limite: 4, etat: "atteint", plancherApplique: true });
    assert.equal(res.body.jauges[1].etat, "ok");
    assert.equal(res.body.jauges[1].usage, 0);
  });

  it("essai en cours ou atelier sans abonnement : aucun quota, jauges illimitées", async () => {
    const essai = await atelier("JaugesEssai", { essai: true });
    const r1 = await essai.api.get("/api/abonnements/utilisation");
    assert.equal(r1.body.quotasAppliques, false);
    assert.equal(r1.body.raison, "ESSAI");
    assert.ok(r1.body.jauges.every((j) => j.limite === null && j.etat === "illimite"));
    const ancien = await atelier("JaugesAncien");
    const r2 = await ancien.api.get("/api/abonnements/utilisation");
    assert.equal(r2.body.raison, "AUCUN");
    assert.equal(r2.body.quotasAppliques, false);
  });

  it("l'usage ne compte que les ressources de l'atelier, archivées exclues", async () => {
    const a = await atelier("Usage", { abonne: true });
    const b = await atelier("UsageAutre", { abonne: true });
    await creerCliente(a.id, { telephone: telephone() });
    await creerCliente(a.id, { telephone: telephone(), archivedAt: new Date() });
    for (let i = 0; i < 3; i++) await creerCliente(b.id, { telephone: telephone() });
    const res = await a.api.get("/api/abonnements/utilisation");
    assert.equal(res.body.jauges[0].usage, 1);
  });

  it("un employé n'a pas accès au suivi de consommation (403) ; sans connexion : 401", async () => {
    const a = await atelier("Droits", { abonne: true });
    const cree = await a.api.post("/api/employes", { identifiant: `emp-u-${marque}`, password: MDP, prenom: "E", nom: "U", poste: "AUTRE" });
    assert.equal(cree.status, 201, JSON.stringify(cree.body));
    const emp = client(baseUrl);
    assert.equal((await emp.post("/api/auth/login", { identifiant: `emp-u-${marque}`, password: MDP })).status, 200);
    assert.equal((await emp.get("/api/abonnements/utilisation")).status, 403);
    assert.equal((await client(baseUrl).get("/api/abonnements/utilisation")).status, 401);
  });

  it("le SUPERADMIN voit l'utilisation de n'importe quel atelier ; un PDG ne voit pas celle d'un autre", async () => {
    const a = await atelier("VueSuper", { abonne: true });
    const autre = await atelier("VueAutre", { abonne: true });
    const res = await superApi.get(`/api/ateliers/${a.id}/utilisation`);
    assert.equal(res.status, 200);
    assert.equal(res.body.jauges.length, 4);
    assert.equal((await autre.api.get(`/api/ateliers/${a.id}/utilisation`)).status, 403);
    assert.equal((await superApi.get("/api/ateliers/inexistant/utilisation")).status, 404);
  });

  it("ateliers qui dépasseraient une formule : liste de lecture seule, rien n'est modifié", async () => {
    const trop = await atelier("Depasse");
    for (let i = 0; i < 5; i++) await creerCliente(trop.id, { telephone: telephone() });
    const ok = await atelier("PasDepasse");
    await creerCliente(ok.id, { telephone: telephone() });
    const res = await superApi.get(`/api/plans-abonnement/${plan.id}/depassements`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const ligne = res.body.ateliers.find((x) => x.atelierId === trop.id);
    assert.deepEqual(ligne.depassements, [{ ressource: "clientes", usage: 5, limite: 3 }]);
    assert.equal(res.body.ateliers.some((x) => x.atelierId === ok.id), false);
    assert.equal(await prisma.cliente.count({ where: { atelierId: trop.id } }), 5, "aucune donnée touchée");
    assert.equal((await trop.api.get(`/api/plans-abonnement/${plan.id}/depassements`)).status, 403);
    const illimitee = await prisma.planAbonnement.create({ data: { nom: `Illim ${marque}`, prixMensuel: "1000" } });
    try {
      assert.deepEqual((await superApi.get(`/api/plans-abonnement/${illimitee.id}/depassements`)).body.ateliers, []);
    } finally {
      await prisma.planAbonnement.delete({ where: { id: illimitee.id } });
    }
  });
});
