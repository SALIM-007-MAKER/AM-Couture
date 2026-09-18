// Fil d'activité client (§ notifications atelier <-> client) — vérifie que
// chaque action ADMIN sur une commande/demande d'un client génère bien
// l'événement attendu, visible UNIQUEMENT par ce client (jamais un autre),
// et que le marquage lu ne fonctionne que pour ces événements (jamais pour
// les "etat" PRET/LIVRAISON_PROCHE, partagés avec l'ADMIN). Base Postgres
// jetable dédiée (voir preload.js).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  demarrerServeur,
  arreterServeur,
  client,
  creerAtelierEtAdmin,
  creerCliente,
  creerCommande,
  creerEtActiverClient,
  supprimerAtelier,
} from "./helpers.js";
import { prisma } from "../lib/prisma.js";

describe("Fil d'activité client — un événement par action ADMIN", () => {
  let server;
  let baseUrl;
  let atelier;
  let identifiantAdmin;
  let passwordAdmin;
  let clienteA;
  let clienteB;
  let userA;
  let userB;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    ({ atelier, identifiant: identifiantAdmin, password: passwordAdmin } = await creerAtelierEtAdmin());
    clienteA = await creerCliente(atelier.id, { telephone: "96000001" });
    clienteB = await creerCliente(atelier.id, { telephone: "96000002" });
    await prisma.mesure.create({ data: { clienteId: clienteA.id, taille: "70" } });
    userA = await creerEtActiverClient(atelier.id, clienteA.id);
    userB = await creerEtActiverClient(atelier.id, clienteB.id);
  });

  after(async () => {
    await arreterServeur(server);
    await supprimerAtelier(atelier.id);
    await prisma.$disconnect();
  });

  test("commande créée -> événement COMMANDE_CREEE visible par le client, jamais par un autre", async () => {
    const adminApi = client(baseUrl);
    await adminApi.post("/api/auth/login", { identifiant: identifiantAdmin, password: passwordAdmin });

    const creation = await adminApi.post("/api/commandes", {
      clienteId: clienteA.id,
      typeVetement: "ROBE",
      prixTotal: "10000",
      dateLivraisonPrevue: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    assert.equal(creation.status, 201);
    const commandeId = creation.body.id;

    const apiA = client(baseUrl);
    await apiA.post("/api/auth/login", { identifiant: userA.identifiant, password: userA.password });
    const notifsA = await apiA.get("/api/moi/notifications");
    const evenement = notifsA.body.data.find((n) => n.type === "COMMANDE_CREEE" && n.commande?.id === commandeId);
    assert.ok(evenement, "COMMANDE_CREEE attendu pour le client A");
    assert.equal(evenement.source, "evenement");
    assert.equal(evenement.canMarkLu, true);
    assert.equal(evenement.lu, false);

    const apiB = client(baseUrl);
    await apiB.post("/api/auth/login", { identifiant: userB.identifiant, password: userB.password });
    const notifsB = await apiB.get("/api/moi/notifications");
    assert.ok(!notifsB.body.data.some((n) => n.commande?.id === commandeId), "le client B ne doit rien voir de la commande de A");
  });

  test("paiement enregistré -> PAIEMENT_ENREGISTRE ; statut changé -> COMMANDE_STATUT_CHANGE ; annulée -> COMMANDE_ANNULEE", async () => {
    const adminApi = client(baseUrl);
    await adminApi.post("/api/auth/login", { identifiant: identifiantAdmin, password: passwordAdmin });

    const commande = await creerCommande(atelier.id, clienteA.id, { prixTotal: "20000" });

    const paiement = await adminApi.post(`/api/commandes/${commande.id}/paiements`, { montant: "5000", mode: "ESPECES" });
    assert.equal(paiement.status, 201);

    const statut = await adminApi.post(`/api/commandes/${commande.id}/statut`, { statut: "EN_CONFECTION" });
    assert.equal(statut.status, 200);

    const annulation = await adminApi.post(`/api/commandes/${commande.id}/statut`, { statut: "ANNULEE" });
    assert.equal(annulation.status, 200);

    const apiA = client(baseUrl);
    await apiA.post("/api/auth/login", { identifiant: userA.identifiant, password: userA.password });
    const notifs = (await apiA.get("/api/moi/notifications")).body.data.filter((n) => n.commande?.id === commande.id);

    assert.ok(notifs.some((n) => n.type === "PAIEMENT_ENREGISTRE"), "PAIEMENT_ENREGISTRE attendu");
    assert.ok(notifs.some((n) => n.type === "COMMANDE_STATUT_CHANGE"), "COMMANDE_STATUT_CHANGE attendu");
    assert.ok(notifs.some((n) => n.type === "COMMANDE_ANNULEE"), "COMMANDE_ANNULEE attendu");
  });

  test("livraison enregistrée -> LIVRAISON_ENREGISTREE ; reçu émis -> RECU_EMIS", async () => {
    const adminApi = client(baseUrl);
    await adminApi.post("/api/auth/login", { identifiant: identifiantAdmin, password: passwordAdmin });

    const commande = await creerCommande(atelier.id, clienteA.id, { prixTotal: "10000", statut: "TERMINEE" });

    const paiement = await adminApi.post(`/api/commandes/${commande.id}/paiements`, { montant: "10000", mode: "ESPECES" });
    assert.equal(paiement.status, 201);

    const livraison = await adminApi.post(`/api/commandes/${commande.id}/livraisons`, {});
    assert.equal(livraison.status, 201);

    const recu = await adminApi.post(`/api/commandes/${commande.id}/recus`, {});
    assert.equal(recu.status, 201);

    const apiA = client(baseUrl);
    await apiA.post("/api/auth/login", { identifiant: userA.identifiant, password: userA.password });
    const notifs = (await apiA.get("/api/moi/notifications")).body.data.filter((n) => n.commande?.id === commande.id);

    assert.ok(notifs.some((n) => n.type === "LIVRAISON_ENREGISTREE"), "LIVRAISON_ENREGISTREE attendu");
    assert.ok(notifs.some((n) => n.type === "RECU_EMIS"), "RECU_EMIS attendu");
  });

  test("demande acceptée -> DEMANDE_ACCEPTEE ; demande refusée -> DEMANDE_REFUSEE", async () => {
    const apiA = client(baseUrl);
    await apiA.post("/api/auth/login", { identifiant: userA.identifiant, password: userA.password });
    const demandeA = await apiA.post("/api/moi/demandes", { description: "Boubou pour un mariage" });
    assert.equal(demandeA.status, 201);
    const demandeB = await apiA.post("/api/moi/demandes", { description: "Un second, pour comparer" });
    assert.equal(demandeB.status, 201);

    const adminApi = client(baseUrl);
    await adminApi.post("/api/auth/login", { identifiant: identifiantAdmin, password: passwordAdmin });
    const commande = await creerCommande(atelier.id, clienteA.id);

    const accepter = await adminApi.post(`/api/demandes/${demandeA.body.id}/accepter`, { commandeId: commande.id });
    assert.equal(accepter.status, 200);
    const refuser = await adminApi.post(`/api/demandes/${demandeB.body.id}/refuser`, { motifRefus: "Trop urgent" });
    assert.equal(refuser.status, 200);

    const notifs = (await apiA.get("/api/moi/notifications")).body.data;
    const notifAcceptee = notifs.find((n) => n.type === "DEMANDE_ACCEPTEE");
    const notifRefusee = notifs.find((n) => n.type === "DEMANDE_REFUSEE");
    assert.ok(notifAcceptee, "DEMANDE_ACCEPTEE attendu");
    assert.match(notifAcceptee.message, new RegExp(commande.numero));
    assert.ok(notifRefusee, "DEMANDE_REFUSEE attendu");
    assert.match(notifRefusee.message, /Trop urgent/);
  });

  test("le compteur non-lues progresse, et le marquage lu ne fonctionne QUE pour les événements (jamais les états)", async () => {
    const adminApi = client(baseUrl);
    await adminApi.post("/api/auth/login", { identifiant: identifiantAdmin, password: passwordAdmin });

    const apiA = client(baseUrl);
    await apiA.post("/api/auth/login", { identifiant: userA.identifiant, password: userA.password });
    const avant = await apiA.get("/api/moi/notifications/non-lues");
    assert.equal(avant.status, 200);

    const creation = await adminApi.post("/api/commandes", {
      clienteId: clienteA.id,
      typeVetement: "ROBE",
      prixTotal: "10000",
      dateLivraisonPrevue: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    assert.equal(creation.status, 201);

    const apres = await apiA.get("/api/moi/notifications/non-lues");
    assert.equal(apres.body.count, avant.body.count + 1);

    const notifs = (await apiA.get("/api/moi/notifications")).body.data;
    const evenement = notifs.find((n) => n.commande?.id === creation.body.id && n.type === "COMMANDE_CREEE");
    const marque = await apiA.patch(`/api/moi/notifications/${evenement.id}`, { lu: true });
    assert.equal(marque.status, 200);

    const apresMarquage = await apiA.get("/api/moi/notifications/non-lues");
    assert.equal(apresMarquage.body.count, avant.body.count);
  });

  test("un compte ADMIN ne peut PAS marquer lu via /api/moi (requireClient)", async () => {
    const adminApi = client(baseUrl);
    await adminApi.post("/api/auth/login", { identifiant: identifiantAdmin, password: passwordAdmin });
    const res = await adminApi.patch("/api/moi/notifications/inexistant", { lu: true });
    assert.equal(res.status, 403);
  });
});
