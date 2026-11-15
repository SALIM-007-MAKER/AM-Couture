// Fournisseurs (6.4) : CRUD, unicité du nom par atelier (insensible à la casse, concurrence comprise), archivage,
// isolation entre ateliers, droits des employés. Base Postgres jetable dédiée (voir preload.js).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { normaliserPermissions } from "../lib/permissions.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";

const MDP = "Atelier-Test-2026!";
const marque = `${process.pid}-${Date.now()}`;

describe("Fournisseurs", () => {
  let server, baseUrl, A, B, pdg, pdgB, lecteur, gestionnaire, sansDroit;
  let n = 0;

  async function employe(nom, permissions) {
    const identifiant = `fou-${nom}-${marque}-${++n}`;
    await prisma.user.create({
      data: { identifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "EMPLOYE", atelierId: A.id, prenom: nom, nom: "Test", poste: "AUTRE", permissions: normaliserPermissions(permissions) },
    });
    const api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant, password: MDP })).status, 200);
    return api;
  }

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const ra = await creerAtelierEtAdmin({ nom: "Atelier Fournisseurs A" });
    const rb = await creerAtelierEtAdmin({ nom: "Atelier Fournisseurs B" });
    A = ra.atelier;
    B = rb.atelier;
    pdg = client(baseUrl);
    pdgB = client(baseUrl);
    assert.equal((await pdg.post("/api/auth/login", { identifiant: ra.identifiant, password: ra.password })).status, 200);
    assert.equal((await pdgB.post("/api/auth/login", { identifiant: rb.identifiant, password: rb.password })).status, 200);
    lecteur = await employe("lecteur", ["fournisseurs.lire"]);
    gestionnaire = await employe("gestionnaire", ["fournisseurs.ecrire"]); // implique la lecture
    sansDroit = await employe("sansdroit", ["stock.lire"]);
  });

  after(async () => {
    await arreterServeur(server);
    for (const a of [A, B]) {
      await prisma.journalSecurite.deleteMany({ where: { atelierId: a.id } });
      await supprimerAtelier(a.id);
    }
    await prisma.$disconnect();
  });

  it("crée, lit, liste et modifie un fournisseur", async () => {
    const c = await pdg.post("/api/fournisseurs", { nom: "  Tissus   du Marché ", contact: "Mme Diallo", telephone: "+221 77 000 00 01", email: "Contact@Marche.test" });
    assert.equal(c.status, 201);
    assert.equal(c.body.nom, "Tissus du Marché"); // espaces normalisés
    assert.equal(c.body.email, "contact@marche.test");
    assert.equal(c.body.atelierId, A.id);

    assert.equal((await pdg.get(`/api/fournisseurs/${c.body.id}`)).body.contact, "Mme Diallo");
    const liste = await pdg.get("/api/fournisseurs?q=marché");
    assert.deepEqual(liste.body.data.map((f) => f.id), [c.body.id]);
    assert.equal((await pdg.get("/api/fournisseurs?q=77 000")).body.data.length, 1);

    const m = await pdg.patch(`/api/fournisseurs/${c.body.id}`, { adresse: "Marché central" });
    assert.equal(m.status, 200);
    assert.equal(m.body.adresse, "Marché central");
    assert.equal(m.body.nom, "Tissus du Marché");
  });

  it("refuse un nom déjà pris, sans tenir compte de la casse, archivés compris", async () => {
    assert.equal((await pdg.post("/api/fournisseurs", { nom: "TISSUS DU MARCHÉ" })).status, 409);
    const a = await pdg.post("/api/fournisseurs", { nom: "Boutons & Fils" });
    assert.equal(a.status, 201);
    await pdg.post(`/api/fournisseurs/${a.body.id}/archiver`);
    const dup = await pdg.post("/api/fournisseurs", { nom: "boutons & fils" });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.details.archive, true);
    // Renommer vers un nom existant est refusé aussi ; garder son propre nom reste permis.
    const autre = await pdg.post("/api/fournisseurs", { nom: "Mercerie Centrale" });
    assert.equal((await pdg.patch(`/api/fournisseurs/${autre.body.id}`, { nom: "tissus du marché" })).status, 409);
    assert.equal((await pdg.patch(`/api/fournisseurs/${autre.body.id}`, { nom: "MERCERIE CENTRALE" })).status, 200);
  });

  it("le même nom reste libre dans un autre atelier", async () => {
    assert.equal((await pdgB.post("/api/fournisseurs", { nom: "Tissus du Marché" })).status, 201);
  });

  it("créations simultanées du même nom : une seule réussit", async () => {
    const reponses = await Promise.all(Array.from({ length: 6 }, () => pdg.post("/api/fournisseurs", { nom: "Course Concurrente" })));
    assert.equal(reponses.filter((r) => r.status === 201).length, 1);
    assert.equal(reponses.filter((r) => r.status === 409).length, 5);
    assert.equal(await prisma.fournisseur.count({ where: { atelierId: A.id, nom: "Course Concurrente" } }), 1);
  });

  it("valide les champs (nom vide, email, téléphone, champ inconnu)", async () => {
    assert.equal((await pdg.post("/api/fournisseurs", { nom: "  " })).status, 400);
    assert.equal((await pdg.post("/api/fournisseurs", { nom: "X1", email: "pas-un-email" })).status, 400);
    assert.equal((await pdg.post("/api/fournisseurs", { nom: "X2", telephone: "abc" })).status, 400);
    assert.equal((await pdg.post("/api/fournisseurs", { nom: "X3", atelierId: B.id })).status, 400);
    assert.equal((await pdg.post("/api/fournisseurs", { nom: "X4", archivedAt: "2020-01-01" })).status, 400);
    assert.equal((await pdg.get("/api/fournisseurs/pas%00un-id")).status, 400);
  });

  it("archive et restaure ; un fournisseur archivé ne se modifie pas ; les listes filtrent", async () => {
    const c = await pdg.post("/api/fournisseurs", { nom: "À archiver" });
    const id = c.body.id;
    assert.equal((await pdg.post(`/api/fournisseurs/${id}/archiver`)).body.archivedAt !== null, true);
    assert.equal((await pdg.post(`/api/fournisseurs/${id}/archiver`)).status, 409);
    assert.equal((await pdg.patch(`/api/fournisseurs/${id}`, { notes: "x" })).status, 409);
    assert.ok(!(await pdg.get("/api/fournisseurs?q=archiver")).body.data.some((f) => f.id === id));
    assert.ok((await pdg.get("/api/fournisseurs?q=archiver&archived=true")).body.data.some((f) => f.id === id));
    assert.equal((await pdg.get("/api/fournisseurs?q=archiver&archived=all")).body.data.length, 1);
    assert.equal((await pdg.post(`/api/fournisseurs/${id}/restaurer`)).body.archivedAt, null);
    assert.equal((await pdg.post(`/api/fournisseurs/${id}/restaurer`)).status, 409);
    assert.equal((await pdg.patch(`/api/fournisseurs/${id}`, { notes: "ok" })).status, 200);
    assert.equal(await prisma.fournisseur.count({ where: { id } }), 1); // jamais supprimé
  });

  it("isolation : l'autre atelier ne voit, ne modifie ni n'archive rien", async () => {
    const f = await prisma.fournisseur.findFirst({ where: { atelierId: A.id, nom: "Tissus du Marché" } });
    assert.equal((await pdgB.get(`/api/fournisseurs/${f.id}`)).status, 404);
    assert.equal((await pdgB.patch(`/api/fournisseurs/${f.id}`, { notes: "piratage" })).status, 404);
    assert.equal((await pdgB.post(`/api/fournisseurs/${f.id}/archiver`)).status, 404);
    assert.equal((await pdgB.post(`/api/fournisseurs/${f.id}/restaurer`)).status, 404);
    const listeB = await pdgB.get("/api/fournisseurs?archived=all&pageSize=100");
    assert.ok(listeB.body.data.every((x) => x.atelierId === B.id));
    assert.equal((await prisma.fournisseur.findUnique({ where: { id: f.id } })).notes, null);
  });

  it("droits : lecture seule, écriture (implique la lecture), aucun droit", async () => {
    const f = await prisma.fournisseur.findFirst({ where: { atelierId: A.id, nom: "Tissus du Marché" } });
    assert.equal((await lecteur.get("/api/fournisseurs")).status, 200);
    assert.equal((await lecteur.get(`/api/fournisseurs/${f.id}`)).status, 200);
    assert.equal((await lecteur.post("/api/fournisseurs", { nom: "Interdit" })).status, 403);
    assert.equal((await lecteur.patch(`/api/fournisseurs/${f.id}`, { notes: "x" })).status, 403);
    assert.equal((await lecteur.post(`/api/fournisseurs/${f.id}/archiver`)).status, 403);

    assert.equal((await gestionnaire.get("/api/fournisseurs")).status, 200);
    assert.equal((await gestionnaire.post("/api/fournisseurs", { nom: "Créé par employé" })).status, 201);

    assert.equal((await sansDroit.get("/api/fournisseurs")).status, 403);
    assert.equal((await sansDroit.post("/api/fournisseurs", { nom: "Non" })).status, 403);
    assert.equal((await client(baseUrl).get("/api/fournisseurs")).status, 401);
  });
});
