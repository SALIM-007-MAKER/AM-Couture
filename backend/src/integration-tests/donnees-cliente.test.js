// Droit d'accès et d'effacement d'une cliente (7.4) : export de SES données uniquement, suppression de son compte avec
// mot de passe, anonymisation par le PDG (garde-fous), isolation entre ateliers. Base Postgres jetable dédiée.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { normaliserPermissions } from "../lib/permissions.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, creerCliente, creerCommande, creerEtActiverClient, supprimerAtelier } from "./helpers.js";

const MDP = "Atelier-Test-2026!";
const marque = `${process.pid}-${Date.now()}`;

describe("Données personnelles d'une cliente", () => {
  let server, baseUrl, A, B, pdg, pdgB, employe;
  const connecter = async (c) => {
    const api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant: c.identifiant, password: c.password })).status, 200);
    return api;
  };
  // Une cliente complète : identité, mesure, commande payée, notification, demande, avec compte de connexion.
  async function clienteComplete(atelierId, tel, { statut = "LIVREE" } = {}) {
    const cliente = await creerCliente(atelierId, {
      nom: "Diop", prenom: "Awa", telephone: tel, telephone2: "+221700000001", email: `awa-${tel}@exemple.test`, adresse: "Rue 10, Dakar", notes: "préfère le wax", sexe: "FEMME",
    });
    const compte = await creerEtActiverClient(atelierId, cliente.id);
    await prisma.mesure.create({ data: { clienteId: cliente.id, taille: "70" } });
    const commande = await creerCommande(atelierId, cliente.id, { statut, description: "Robe de mariage" });
    await prisma.paiement.create({ data: { commandeId: commande.id, montant: "4000", mode: "ESPECES" } });
    await prisma.notificationClient.create({ data: { clienteId: cliente.id, commandeId: commande.id, type: "COMMANDE_CREEE", message: "Commande créée" } });
    await prisma.demandeCommande.create({ data: { atelierId, clienteId: cliente.id, description: "Je voudrais un boubou pour Awa Diop" } });
    return { cliente, compte, commande };
  }

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const ra = await creerAtelierEtAdmin({ nom: "Atelier Données A" });
    const rb = await creerAtelierEtAdmin({ nom: "Atelier Données B" });
    A = ra.atelier;
    B = rb.atelier;
    pdg = await connecter(ra);
    pdgB = await connecter(rb);
    const identifiant = `donnees-emp-${marque}`;
    await prisma.user.create({
      data: { identifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "EMPLOYE", atelierId: A.id, prenom: "E", nom: "Test", poste: "AUTRE", permissions: normaliserPermissions(["clientes.ecrire", "clientes.lire"]) },
    });
    employe = await connecter({ identifiant, password: MDP });
  });

  after(async () => {
    await arreterServeur(server);
    await supprimerAtelier(A.id);
    await supprimerAtelier(B.id);
    await prisma.$disconnect();
  });

  describe("export", () => {
    it("contient SES données complètes, rien d'une autre cliente ni d'interne", async () => {
      const a = await clienteComplete(A.id, "96100001");
      const autre = await clienteComplete(A.id, "96100002");
      const api = await connecter(a.compte);
      const res = await api.get("/api/moi/export");
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-disposition"), /^attachment; filename="mes-donnees-\d{4}-\d{2}-\d{2}\.json"$/);
      assert.equal(res.headers.get("cache-control"), "no-store");
      const d = res.body;
      assert.equal(d.atelier, "Atelier Données A");
      assert.equal(d.profil.nom, "Diop");
      assert.equal(d.profil.telephone, "96100001");
      assert.equal(d.mesures.length, 1);
      assert.equal(d.commandes.length, 1);
      assert.equal(d.commandes[0].numero, a.commande.numero);
      assert.equal(d.commandes[0].paiements.length, 1);
      assert.equal(d.demandes.length, 1);
      assert.equal(d.activite.length, 1);
      // Pas d'identifiants techniques internes, pas d'autre cliente.
      const brut = JSON.stringify(d);
      assert.ok(!brut.includes(a.cliente.userId ?? "—userId"), "userId ne doit pas apparaître");
      assert.ok(!brut.includes(A.id), "atelierId ne doit pas apparaître");
      assert.ok(!brut.includes("96100002"), "données d'une autre cliente");
      assert.ok(!brut.includes(autre.commande.numero));
      assert.ok(!brut.includes("passwordHash"));
    });

    it("refuse les non-clientes (PDG, employé, visiteur)", async () => {
      assert.equal((await pdg.get("/api/moi/export")).status, 403);
      assert.equal((await employe.get("/api/moi/export")).status, 403);
      assert.equal((await client(baseUrl).get("/api/moi/export")).status, 401);
    });
  });

  describe("suppression du compte par la cliente", () => {
    it("exige le mot de passe : un mauvais mot de passe ne change rien", async () => {
      const a = await clienteComplete(A.id, "96100010");
      const api = await connecter(a.compte);
      const res = await api.post("/api/moi/suppression", { motDePasse: "mauvais" });
      assert.equal(res.status, 400);
      assert.equal((await api.get("/api/moi")).status, 200, "la session reste valide");
      const apres = await prisma.cliente.findUnique({ where: { id: a.cliente.id } });
      assert.equal(apres.suppressionDemandeeLe, null);
      assert.equal(apres.userId, a.compte.user.id);
      assert.equal((await api.post("/api/moi/suppression", {})).status, 400);
      assert.equal((await api.post("/api/moi/suppression", { motDePasse: "password123", extra: 1 })).status, 400);
    });

    it("ferme le compte et la session, marque la fiche, conserve les données métier", async () => {
      const a = await clienteComplete(A.id, "96100011");
      const api = await connecter(a.compte);
      const res = await api.post("/api/moi/suppression", { motDePasse: a.compte.password });
      assert.equal(res.status, 200);
      assert.equal(await prisma.user.count({ where: { id: a.compte.user.id } }), 0);
      assert.equal((await api.get("/api/moi")).status, 401, "la session est fermée");
      // Reconnexion impossible
      assert.equal((await client(baseUrl).post("/api/auth/login", { identifiant: a.compte.identifiant, password: a.compte.password })).status, 401);
      const fiche = await prisma.cliente.findUnique({ where: { id: a.cliente.id } });
      assert.ok(fiche.suppressionDemandeeLe);
      assert.equal(fiche.userId, null);
      assert.equal(fiche.anonymiseeLe, null, "l'atelier doit encore traiter");
      assert.equal(fiche.nom, "Diop", "rien n'est effacé sans l'atelier");
      assert.equal(await prisma.commande.count({ where: { clienteId: a.cliente.id } }), 1);
      assert.equal(await prisma.paiement.count({ where: { commande: { clienteId: a.cliente.id } } }), 1);
    });

    it("l'atelier retrouve la demande d'effacement par filtre", async () => {
      const liste = await pdg.get("/api/clientes?effacement=true");
      assert.equal(liste.status, 200);
      assert.ok(liste.body.data.length >= 1);
      assert.ok(liste.body.data.every((c) => c.suppressionDemandeeLe && !c.anonymiseeLe));
      assert.equal((await pdgB.get("/api/clientes?effacement=true")).body.data.length, 0, "pas celles d'un autre atelier");
      assert.equal((await pdg.get("/api/clientes?effacement=non")).status, 400);
    });
  });

  describe("anonymisation par l'atelier", () => {
    it("remplace l'identité, supprime mesures/activité/compte, garde commandes et paiements", async () => {
      const a = await clienteComplete(A.id, "96100020");
      const res = await pdg.post(`/api/clientes/${a.cliente.id}/anonymiser`);
      assert.equal(res.status, 200);
      const f = await prisma.cliente.findUnique({ where: { id: a.cliente.id } });
      assert.equal(f.nom, "Cliente");
      assert.equal(f.prenom, "anonymisée");
      assert.equal(f.telephone, `anonyme-${a.cliente.id}`);
      for (const champ of ["telephone2", "email", "adresse", "notes", "sexe", "userId"]) assert.equal(f[champ], null, champ);
      assert.ok(f.archivedAt && f.anonymiseeLe);
      assert.equal(await prisma.mesure.count({ where: { clienteId: a.cliente.id } }), 0);
      assert.equal(await prisma.notificationClient.count({ where: { clienteId: a.cliente.id } }), 0);
      assert.equal(await prisma.user.count({ where: { id: a.compte.user.id } }), 0);
      assert.equal(await prisma.commande.count({ where: { clienteId: a.cliente.id } }), 1, "commande conservée");
      assert.equal(await prisma.paiement.count({ where: { commande: { clienteId: a.cliente.id } } }), 1, "paiement conservé");
      const d = await prisma.demandeCommande.findFirst({ where: { clienteId: a.cliente.id } });
      assert.equal(d.description, null, "le texte libre qui cite la personne est effacé");
      // Plus aucune trace de l'identité d'origine dans la fiche
      assert.ok(!JSON.stringify(f).includes("Awa") && !JSON.stringify(f).includes("96100020") && !JSON.stringify(f).includes("exemple.test"));
    });

    it("libère le numéro : une nouvelle fiche avec le même téléphone est possible", async () => {
      const res = await pdg.post("/api/clientes", { nom: "Nouvelle", prenom: "Fiche", telephone: "96100020" });
      assert.equal(res.status, 201);
    });

    it("est refusée tant qu'une commande est en cours, puis acceptée une fois livrée", async () => {
      const a = await clienteComplete(A.id, "96100030", { statut: "EN_CONFECTION" });
      const refus = await pdg.post(`/api/clientes/${a.cliente.id}/anonymiser`);
      assert.equal(refus.status, 409);
      assert.match(refus.body.error, /commandes en cours/);
      assert.equal((await prisma.cliente.findUnique({ where: { id: a.cliente.id } })).nom, "Diop", "rien n'a changé");
      assert.equal(await prisma.mesure.count({ where: { clienteId: a.cliente.id } }), 1);
      await prisma.commande.update({ where: { id: a.commande.id }, data: { statut: "LIVREE" } });
      assert.equal((await pdg.post(`/api/clientes/${a.cliente.id}/anonymiser`)).status, 200);
    });

    it("est réservée au PDG et à son atelier", async () => {
      const a = await clienteComplete(A.id, "96100040");
      assert.equal((await employe.post(`/api/clientes/${a.cliente.id}/anonymiser`)).status, 403);
      assert.equal((await pdgB.post(`/api/clientes/${a.cliente.id}/anonymiser`)).status, 404);
      assert.equal((await client(baseUrl).post(`/api/clientes/${a.cliente.id}/anonymiser`)).status, 401);
      assert.equal((await prisma.cliente.findUnique({ where: { id: a.cliente.id } })).nom, "Diop");
    });

    it("n'est pas rejouable, et la fiche anonymisée ne peut être ni restaurée, ni modifiée, ni invitée", async () => {
      const a = await clienteComplete(A.id, "96100050");
      assert.equal((await pdg.post(`/api/clientes/${a.cliente.id}/anonymiser`)).status, 200);
      assert.equal((await pdg.post(`/api/clientes/${a.cliente.id}/anonymiser`)).status, 409);
      const restaurer = await pdg.post(`/api/clientes/${a.cliente.id}/restaurer`);
      assert.equal(restaurer.status, 409);
      assert.match(restaurer.body.error, /anonymisée/);
      assert.equal((await pdg.patch(`/api/clientes/${a.cliente.id}`, { nom: "Retour" })).status, 409);
      const inviter = await pdg.post(`/api/clientes/${a.cliente.id}/inviter`);
      assert.equal(inviter.status, 409);
      assert.equal((await prisma.user.count({ where: { identifiant: `anonyme-${a.cliente.id}` } })), 0);
    });

    it("anonymise aussi une cliente sans compte de connexion", async () => {
      const cliente = await creerCliente(A.id, { nom: "Sans", prenom: "Compte", telephone: "96100060" });
      assert.equal((await pdg.post(`/api/clientes/${cliente.id}/anonymiser`)).status, 200);
    });

    it("deux anonymisations simultanées : une seule réussit, l'autre est refusée", async () => {
      const a = await clienteComplete(A.id, "96100070");
      const [r1, r2] = await Promise.all([pdg.post(`/api/clientes/${a.cliente.id}/anonymiser`), pdg.post(`/api/clientes/${a.cliente.id}/anonymiser`)]);
      assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
    });
  });
});
