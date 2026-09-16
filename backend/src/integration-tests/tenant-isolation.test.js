// Matrice d'isolation multi-tenant (§ audit SaaS, point "IDOR/BOLA") —
// ADMIN A ne doit JAMAIS pouvoir lire/modifier une ressource de l'atelier B,
// même en devinant/réutilisant un ID valide. Base Postgres jetable dédiée
// (voir preload.js) — jamais la base de dev/prod partagée.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  demarrerServeur,
  arreterServeur,
  client,
  creerAtelierEtAdmin,
  creerCliente,
  creerCommande,
  supprimerAtelier,
} from "./helpers.js";
import { prisma } from "../lib/prisma.js";

describe("Isolation multi-tenant", () => {
  let server;
  let baseUrl;
  let atelierA;
  let atelierB;
  let clienteA;
  let commandeA;
  let apiA;
  let apiB;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());

    const a = await creerAtelierEtAdmin({ nom: "Atelier A" });
    const b = await creerAtelierEtAdmin({ nom: "Atelier B" });
    atelierA = a.atelier;
    atelierB = b.atelier;

    clienteA = await creerCliente(atelierA.id, { nom: "Secrète", prenom: "ClienteA" });
    commandeA = await creerCommande(atelierA.id, clienteA.id);

    apiA = client(baseUrl);
    apiB = client(baseUrl);
    const loginA = await apiA.post("/api/auth/login", { identifiant: a.identifiant, password: a.password });
    assert.equal(loginA.status, 200);
    const loginB = await apiB.post("/api/auth/login", { identifiant: b.identifiant, password: b.password });
    assert.equal(loginB.status, 200);
  });

  after(async () => {
    await arreterServeur(server);
    await supprimerAtelier(atelierA.id);
    await supprimerAtelier(atelierB.id);
    await prisma.$disconnect();
  });

  test("ADMIN A peut lire SA PROPRE cliente", async () => {
    const res = await apiA.get(`/api/clientes/${clienteA.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, clienteA.id);
  });

  test("ADMIN B ne peut PAS lire la cliente de l'atelier A", async () => {
    const res = await apiB.get(`/api/clientes/${clienteA.id}`);
    assert.equal(res.status, 404);
  });

  test("ADMIN B ne peut PAS modifier la cliente de l'atelier A", async () => {
    const res = await apiB.patch(`/api/clientes/${clienteA.id}`, { nom: "Piraté" });
    assert.equal(res.status, 404);
    const relue = await prisma.cliente.findUnique({ where: { id: clienteA.id } });
    assert.equal(relue.nom, "Secrète");
  });

  test("ADMIN B ne peut PAS archiver la cliente de l'atelier A", async () => {
    const res = await apiB.post(`/api/clientes/${clienteA.id}/archiver`);
    assert.equal(res.status, 404);
  });

  test("ADMIN B ne peut PAS lire la commande de l'atelier A", async () => {
    const res = await apiB.get(`/api/commandes/${commandeA.id}`);
    assert.equal(res.status, 404);
  });

  test("ADMIN B ne peut PAS lister les paiements de la commande de l'atelier A", async () => {
    const res = await apiB.get(`/api/commandes/${commandeA.id}/paiements`);
    assert.equal(res.status, 404);
  });

  test("ADMIN B ne peut PAS enregistrer de paiement sur la commande de l'atelier A", async () => {
    const res = await apiB.post(`/api/commandes/${commandeA.id}/paiements`, { montant: "1000", mode: "ESPECES" });
    assert.equal(res.status, 404);
  });

  test("ADMIN B ne voit la cliente de l'atelier A dans AUCUNE page de sa propre liste", async () => {
    const res = await apiB.get("/api/clientes?pageSize=100");
    assert.equal(res.status, 200);
    assert.ok(!res.body.data.some((c) => c.id === clienteA.id));
  });

  test("ADMIN B ne peut PAS créer une commande rattachée à la cliente de l'atelier A", async () => {
    const res = await apiB.post("/api/commandes", {
      clienteId: clienteA.id,
      typeVetement: "ROBE",
      prixTotal: "5000",
      dateLivraisonPrevue: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    // 404 : buildCommandesWhere/la vérification de clienteId exige que la
    // cliente appartienne à l'atelier de l'admin connecté (voir
    // commandes.routes.js) — jamais un 400/500 qui laisserait deviner
    // l'existence de la cliente ailleurs.
    assert.equal(res.status, 404);
  });
});
