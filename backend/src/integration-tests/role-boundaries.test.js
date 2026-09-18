// Frontières entre rôles (§ plan rôle USER, Phase 3) — couvre en particulier
// une régression réelle trouvée pendant le développement : requireAtelier ne
// vérifiait que la présence d'un atelierId, or un compte USER en a un lui
// aussi (celui de l'atelier dont il est client), ce qui lui donnait accès à
// TOUTES les routes ADMIN. Base Postgres jetable dédiée (voir preload.js).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
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
import { supprimerCompteAtelier } from "../lib/atelierProvisioning.js";

describe("Frontières entre rôles ADMIN / USER", () => {
  let server;
  let baseUrl;
  let atelier;
  let identifiantAdmin;
  let passwordAdmin;
  let clienteA;
  let clienteB;
  let commandeA;
  let recuA;
  let userA;
  let userB;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    ({ atelier, identifiant: identifiantAdmin, password: passwordAdmin } = await creerAtelierEtAdmin());

    clienteA = await creerCliente(atelier.id, { nom: "Cliente", prenom: "A", telephone: "91000001" });
    clienteB = await creerCliente(atelier.id, { nom: "Cliente", prenom: "B", telephone: "91000002" });
    commandeA = await creerCommande(atelier.id, clienteA.id);
    await prisma.mesure.create({ data: { clienteId: clienteA.id, taille: "70" } });
    recuA = await prisma.recu.create({
      data: { commandeId: commandeA.id, montantPaye: "5000", numero: `REC-TEST-${Date.now()}` },
    });

    userA = await creerEtActiverClient(atelier.id, clienteA.id);
    userB = await creerEtActiverClient(atelier.id, clienteB.id);
  });

  after(async () => {
    await arreterServeur(server);
    await supprimerAtelier(atelier.id);
    await prisma.$disconnect();
  });

  test("RÉGRESSION : un compte USER ne peut PAS accéder aux routes ADMIN (requireAtelier)", async () => {
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant: userA.identifiant, password: userA.password });
    for (const chemin of ["/api/clientes", "/api/commandes", "/api/dashboard/summary", "/api/parametres"]) {
      const res = await api.get(chemin);
      assert.equal(res.status, 403, `${chemin} devrait renvoyer 403 pour un compte USER`);
    }
  });

  test("un compte ADMIN ne peut PAS accéder à /api/moi (requireClient)", async () => {
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant: identifiantAdmin, password: passwordAdmin });
    const res = await api.get("/api/moi");
    assert.equal(res.status, 403);
  });

  test("un compte SUPERADMIN ne peut PAS accéder à /api/moi", async () => {
    const passwordHash = await bcrypt.hash("password123", 4);
    const superadmin = await prisma.user.create({
      data: { identifiant: `superadmin-test-${Date.now()}`, passwordHash, role: "SUPERADMIN" },
    });
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant: superadmin.identifiant, password: "password123" });
    const res = await api.get("/api/moi");
    assert.equal(res.status, 403);
    await prisma.user.delete({ where: { id: superadmin.id } });
  });

  test("USER A voit son propre profil et sa propre commande", async () => {
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant: userA.identifiant, password: userA.password });
    const profil = await api.get("/api/moi");
    assert.equal(profil.status, 200);
    assert.equal(profil.body.id, clienteA.id);
    const commandes = await api.get("/api/moi/commandes");
    assert.equal(commandes.status, 200);
    assert.equal(commandes.body.data.length, 1);
    assert.equal(commandes.body.data[0].id, commandeA.id);
  });

  test("USER B ne voit NI le profil, NI les commandes, NI les mesures de la cliente A", async () => {
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant: userB.identifiant, password: userB.password });

    const commandeDetail = await api.get(`/api/moi/commandes/${commandeA.id}`);
    assert.equal(commandeDetail.status, 404);

    const commandes = await api.get("/api/moi/commandes");
    assert.equal(commandes.status, 200);
    assert.equal(commandes.body.data.length, 0);

    const mesures = await api.get("/api/moi/mesures");
    assert.equal(mesures.status, 200);
    assert.equal(mesures.body.data.length, 0);

    // Le profil lui-même est dérivé de req.user.clienteId (signé au login),
    // jamais d'un id fourni par le client : rien ne permet à USER B de
    // demander explicitement le profil de la cliente A.
    const profil = await api.get("/api/moi");
    assert.equal(profil.body.id, clienteB.id);
  });

  test("USER A voit son reçu, USER B ne peut ni le lister ni télécharger son PDF", async () => {
    const apiA = client(baseUrl);
    await apiA.post("/api/auth/login", { identifiant: userA.identifiant, password: userA.password });
    const recusA = await apiA.get("/api/moi/recus");
    assert.equal(recusA.status, 200);
    assert.equal(recusA.body.data.length, 1);
    assert.equal(recusA.body.data[0].id, recuA.id);

    const apiB = client(baseUrl);
    await apiB.post("/api/auth/login", { identifiant: userB.identifiant, password: userB.password });
    const recusB = await apiB.get("/api/moi/recus");
    assert.equal(recusB.status, 200);
    assert.equal(recusB.body.data.length, 0);

    const pdf = await apiB.get(`/api/moi/recus/${recuA.id}/pdf`);
    assert.equal(pdf.status, 404);
  });

  test("RÉGRESSION : une demande de commande d'un client compte dans la pastille de notifications de l'ADMIN", async () => {
    const apiA = client(baseUrl);
    await apiA.post("/api/auth/login", { identifiant: userA.identifiant, password: userA.password });

    const adminApi = client(baseUrl);
    await adminApi.post("/api/auth/login", { identifiant: identifiantAdmin, password: passwordAdmin });
    const avant = await adminApi.get("/api/notifications/nombre-non-lues");
    assert.equal(avant.status, 200);

    const demande = await apiA.post("/api/moi/demandes", { description: "Un boubou pour un mariage." });
    assert.equal(demande.status, 201);

    const apres = await adminApi.get("/api/notifications/nombre-non-lues");
    assert.equal(apres.status, 200);
    assert.equal(apres.body.demandes, avant.body.demandes + 1);
    assert.equal(apres.body.count, avant.body.count + 1);
  });
});

describe("Invitation client de bout en bout", () => {
  let server;
  let baseUrl;
  let atelier;
  let identifiantAdmin;
  let passwordAdmin;
  let cliente;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    ({ atelier, identifiant: identifiantAdmin, password: passwordAdmin } = await creerAtelierEtAdmin());
    cliente = await creerCliente(atelier.id, { telephone: "92000001" });
  });

  after(async () => {
    await arreterServeur(server);
    await supprimerAtelier(atelier.id);
    await prisma.$disconnect();
  });

  test("inviter -> activer -> connecté automatiquement -> accès à /api/moi", async () => {
    const adminApi = client(baseUrl);
    await adminApi.post("/api/auth/login", { identifiant: identifiantAdmin, password: passwordAdmin });

    const invitation = await adminApi.post(`/api/clientes/${cliente.id}/inviter`);
    assert.equal(invitation.status, 201);
    const url = new URL(invitation.body.lienActivation);
    const token = url.searchParams.get("token");
    assert.ok(token);

    // Ré-inviter doit être refusé : le lien n'a même pas encore été activé.
    const reInvitation = await adminApi.post(`/api/clientes/${cliente.id}/inviter`);
    assert.equal(reInvitation.status, 409);

    const clientApi = client(baseUrl);
    const activation = await clientApi.post("/api/auth/activer-compte-client", {
      token,
      nouveauMotDePasse: "motdepasseclient123",
    });
    assert.equal(activation.status, 200);
    assert.equal(activation.body.role, "USER");

    // La cookie posée par l'activation elle-même doit déjà donner accès —
    // pas besoin d'un second /login.
    const profil = await clientApi.get("/api/moi");
    assert.equal(profil.status, 200);
    assert.equal(profil.body.id, cliente.id);
  });

  test("inviter une cliente AVEC email n'échoue jamais si l'envoi automatique échoue (RESEND_API_KEY absent en CI)", async () => {
    const clienteAvecEmail = await creerCliente(atelier.id, { telephone: "92000002", email: "test@example.com" });
    const adminApi = client(baseUrl);
    await adminApi.post("/api/auth/login", { identifiant: identifiantAdmin, password: passwordAdmin });

    const invitation = await adminApi.post(`/api/clientes/${clienteAvecEmail.id}/inviter`);
    assert.equal(invitation.status, 201);
    assert.ok(invitation.body.lienActivation);

    // RÉGRESSION : sans cet email reporté sur le compte, "mot de passe
    // oublié" (auth.routes.js) ne peut jamais rien envoyer pour ce client.
    const compteCree = await prisma.user.findUnique({ where: { identifiant: "92000002" } });
    assert.equal(compteCree.email, "test@example.com");
  });

  test("RÉGRESSION : deux clientes avec le MÊME email -> le compte de la seconde reste sans email (User.email est unique)", async () => {
    const clienteA = await creerCliente(atelier.id, { telephone: "92000003", email: "partage@example.com" });
    const clienteB = await creerCliente(atelier.id, { telephone: "92000004", email: "partage@example.com" });
    const adminApi = client(baseUrl);
    await adminApi.post("/api/auth/login", { identifiant: identifiantAdmin, password: passwordAdmin });

    const invitationA = await adminApi.post(`/api/clientes/${clienteA.id}/inviter`);
    assert.equal(invitationA.status, 201);

    // Ne doit JAMAIS échouer (contrainte unique évitée en amont), même si
    // l'email est déjà pris par le compte de la cliente A.
    const invitationB = await adminApi.post(`/api/clientes/${clienteB.id}/inviter`);
    assert.equal(invitationB.status, 201);

    const compteA = await prisma.user.findUnique({ where: { identifiant: "92000003" } });
    const compteB = await prisma.user.findUnique({ where: { identifiant: "92000004" } });
    assert.equal(compteA.email, "partage@example.com");
    assert.equal(compteB.email, null);
  });
});

describe("Décompte des comptes ADMIN insensible aux comptes USER", () => {
  let atelier;
  let admin;
  let cliente;

  before(async () => {
    ({ atelier, admin } = await creerAtelierEtAdmin());
    cliente = await creerCliente(atelier.id, { telephone: "93000001" });
    await creerEtActiverClient(atelier.id, cliente.id);
  });

  after(async () => {
    await supprimerAtelier(atelier.id);
    await prisma.$disconnect();
  });

  test("RÉGRESSION : retirer le seul ADMIN reste refusé même si des comptes USER existent", async () => {
    await assert.rejects(
      () => supprimerCompteAtelier({ atelierId: atelier.id, userId: admin.id }),
      /dernier compte ADMIN/,
    );
  });
});
