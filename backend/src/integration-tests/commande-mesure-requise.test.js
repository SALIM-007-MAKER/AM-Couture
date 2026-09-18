// Une commande sur mesure suppose des mesures déjà prises — voir
// POST /api/commandes (commandes.routes.js) : refusée pour un client sans
// AUCUNE mesure en historique, autorisée dès qu'il en a au moins une (même
// ancienne — pas besoin d'en reprendre une à chaque commande). Base
// Postgres jetable dédiée (voir preload.js).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, creerCliente, supprimerAtelier } from "./helpers.js";
import { prisma } from "../lib/prisma.js";

describe("Une commande exige au moins une mesure déjà enregistrée pour le client", () => {
  let server;
  let baseUrl;
  let atelier;
  let identifiant;
  let password;
  let clienteSansMesure;
  let clienteAvecMesure;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    ({ atelier, identifiant, password } = await creerAtelierEtAdmin());
    clienteSansMesure = await creerCliente(atelier.id, { telephone: "95000001" });
    clienteAvecMesure = await creerCliente(atelier.id, { telephone: "95000002" });
    await prisma.mesure.create({ data: { clienteId: clienteAvecMesure.id, taille: "70" } });
  });

  after(async () => {
    await arreterServeur(server);
    await supprimerAtelier(atelier.id);
    await prisma.$disconnect();
  });

  test("RÉGRESSION : client SANS aucune mesure -> 409 à la création d'une commande", async () => {
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant, password });
    const res = await api.post("/api/commandes", {
      clienteId: clienteSansMesure.id,
      typeVetement: "ROBE",
      prixTotal: "10000",
      dateLivraisonPrevue: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.details?.mesureManquante, true);
  });

  test("client avec au moins une mesure (même ancienne) -> commande créée normalement", async () => {
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant, password });
    const res = await api.post("/api/commandes", {
      clienteId: clienteAvecMesure.id,
      typeVetement: "ROBE",
      prixTotal: "10000",
      dateLivraisonPrevue: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    assert.equal(res.status, 201);
  });

  test("prendre une mesure pour le client bloqué débloque ensuite la création de commande", async () => {
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant, password });

    const mesure = await api.post(`/api/clientes/${clienteSansMesure.id}/mesures`, { taille: "68" });
    assert.equal(mesure.status, 201);

    const res = await api.post("/api/commandes", {
      clienteId: clienteSansMesure.id,
      typeVetement: "ROBE",
      prixTotal: "10000",
      dateLivraisonPrevue: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    assert.equal(res.status, 201);
  });
});
