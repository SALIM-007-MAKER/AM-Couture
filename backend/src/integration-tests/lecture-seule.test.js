// Lecture seule après la période de grâce : l'atelier consulte et exporte ses données, il n'en crée ni n'en modifie
// plus ; aucune donnée n'est jamais supprimée ni masquée. Base Postgres jetable dédiée (voir preload.js).
//
// Attention : ParametresPlateforme.joursGrace est une ligne GLOBALE partagée par les fichiers de test qui tournent en
// parallèle. Ce fichier ne la modifie que pour la valeur 10 (puis la remet à 7), et les scénarios des autres fichiers
// donnent le même résultat pour 7 et pour 10 jours.
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
  supprimerAtelier,
} from "./helpers.js";
import { prisma } from "../lib/prisma.js";

const JOUR = 86_400_000;
const MDP = "Atelier-Test-2026!";

describe("Grâce puis lecture seule", () => {
  let server, baseUrl, atelier, api, superApi, superId, superIdentifiant, plan, cliente, commande;

  const finEssai = (joursEcoules) =>
    prisma.atelier.update({ where: { id: atelier.id }, data: { trialEndsAt: new Date(Date.now() - joursEcoules * JOUR) } });
  const nouvelleCliente = (tel) => api.post("/api/clientes", { nom: "Test", prenom: "Ecriture", telephone: tel });
  const etat = async () => (await api.get("/api/abonnements/etat")).body;
  const compter = async () => ({
    clientes: await prisma.cliente.count({ where: { atelierId: atelier.id } }),
    commandes: await prisma.commande.count({ where: { atelierId: atelier.id } }),
    paiements: await prisma.paiement.count({ where: { commande: { atelierId: atelier.id } } }),
    depenses: await prisma.depense.count({ where: { atelierId: atelier.id } }),
    stock: await prisma.articleStock.count({ where: { atelierId: atelier.id } }),
  });

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    let identifiant, password;
    ({ atelier, identifiant, password } = await creerAtelierEtAdmin({ nom: "Atelier Lecture Seule" }));
    cliente = await creerCliente(atelier.id, { telephone: "90004444" });
    commande = await creerCommande(atelier.id, cliente.id);
    await prisma.paiement.create({ data: { commandeId: commande.id, montant: "2000", mode: "ESPECES" } });
    superIdentifiant = `superadmin-ro-${process.pid}-${Date.now()}`;
    const sa = await prisma.user.create({
      data: { identifiant: superIdentifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "SUPERADMIN" },
    });
    superId = sa.id;
    api = client(baseUrl);
    superApi = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant, password })).status, 200);
    assert.equal((await superApi.post("/api/auth/login", { identifiant: superIdentifiant, password: MDP })).status, 200);
    plan = await prisma.planAbonnement.create({ data: { nom: `Plan RO ${process.pid}`, prixMensuel: "5000" } });
  });

  after(async () => {
    await arreterServeur(server);
    await prisma.factureAbonnement.deleteMany({ where: { atelierId: atelier.id } });
    await prisma.transaction.deleteMany({ where: { atelierId: atelier.id } });
    await prisma.historiqueAbonnement.deleteMany({ where: { atelierId: atelier.id } });
    await prisma.abonnement.deleteMany({ where: { atelierId: atelier.id } });
    await supprimerAtelier(atelier.id);
    await prisma.planAbonnement.delete({ where: { id: plan.id } });
    await prisma.journalSecurite.deleteMany({ where: { atelierId: atelier.id } });
    await prisma.user.delete({ where: { id: superId } });
    await prisma.$disconnect();
  });

  test("atelier ancien (sans échéance d'essai) : jamais restreint", async () => {
    assert.equal((await nouvelleCliente("90005001")).status, 201);
    assert.equal((await etat()).acces.mode, "COMPLET");
  });

  test("essai terminé depuis 3 jours : période de grâce, tout fonctionne encore", async () => {
    await finEssai(3);
    const e = await etat();
    assert.equal(e.acces.mode, "GRACE");
    assert.equal(e.acces.joursGraceRestants, 4);
    assert.equal((await nouvelleCliente("90005002")).status, 201);
    assert.equal((await api.patch(`/api/clientes/${cliente.id}`, { notes: "mis à jour en période de grâce" })).status, 200);
  });

  describe("après la grâce (essai terminé depuis 30 jours)", () => {
    before(() => finEssai(30));

    test("l'état annonce la lecture seule", async () => {
      assert.equal((await etat()).acces.mode, "LECTURE_SEULE");
    });

    test("toutes les écritures métier sont refusées (402, lectureSeule) et n'ont aucun effet", async () => {
      const avant = await compter();
      const ecritures = [
        ["POST", "/api/clientes", { nom: "X", prenom: "Y", telephone: "90006001" }],
        ["PATCH", `/api/clientes/${cliente.id}`, { notes: "non" }],
        ["POST", `/api/clientes/${cliente.id}/archiver`, {}],
        ["POST", "/api/commandes", { clienteId: cliente.id, typeVetement: "ROBE", prixTotal: "1000" }],
        ["PATCH", `/api/commandes/${commande.id}`, { couleur: "rouge" }],
        ["POST", `/api/commandes/${commande.id}/statut`, { statut: "EN_CONFECTION" }],
        ["POST", `/api/commandes/${commande.id}/paiements`, { montant: "500", mode: "ESPECES" }],
        ["POST", `/api/commandes/${commande.id}/livraisons`, {}],
        ["POST", "/api/depenses", { categorie: "Tissu", montant: "1000" }],
        ["POST", "/api/stock", { nom: "Fil" }],
        ["POST", "/api/modeles", { nom: "Boubou", categorie: "BOUBOU" }],
        ["PUT", "/api/parametres", { nom: "Nouveau nom", devise: "FCFA" }],
        ["PATCH", "/api/parametres", { slogan: "non" }],
      ];
      for (const [methode, chemin, corps] of ecritures) {
        const res = await api[methode.toLowerCase()](chemin, corps);
        assert.equal(res.status, 402, `${methode} ${chemin}`);
        assert.equal(res.body.details.lectureSeule, true, `${methode} ${chemin}`);
      }
      assert.deepEqual(await compter(), avant, "aucune donnée créée, modifiée ni supprimée");
      assert.equal((await prisma.cliente.findUnique({ where: { id: cliente.id } })).archivedAt, null);
    });

    test("la consultation et les exports restent possibles", async () => {
      const lectures = [
        "/api/clientes",
        "/api/clientes/export",
        `/api/clientes/${cliente.id}`,
        `/api/clientes/${cliente.id}/totaux`,
        "/api/commandes",
        "/api/commandes/export",
        `/api/commandes/${commande.id}`,
        `/api/commandes/${commande.id}/fiche-pdf`,
        `/api/commandes/${commande.id}/paiements`,
        "/api/paiements",
        "/api/depenses",
        "/api/depenses/export",
        "/api/stock",
        "/api/stock/export",
        "/api/recus",
        "/api/modeles",
        "/api/dashboard/summary",
        "/api/rapports/finances",
        "/api/parametres",
        "/api/notifications",
        "/api/abonnements/etat",
      ];
      for (const chemin of lectures) {
        const res = await fetch(`${baseUrl}${chemin}`, { headers: { Cookie: api.cookie() } });
        assert.equal(res.status, 200, chemin);
      }
    });

    test("les exports contiennent bien les données de l'atelier", async () => {
      const csv = await (await fetch(`${baseUrl}/api/clientes/export`, { headers: { Cookie: api.cookie() } })).text();
      assert.match(csv, /90004444/);
    });

    test("restent possibles : état « lu » des notifications et compte", async () => {
      assert.notEqual((await api.post("/api/notifications/marquer-lu", { ids: ["inexistant"] })).status, 402);
      assert.equal((await api.patch("/api/compte", { langue: "fr" })).status, 200);
    });

    test("un abonnement suspendu après l'essai : lecture seule, écriture refusée", async () => {
      const ab = await prisma.abonnement.create({
        data: {
          numero: `TEST-RO-${process.pid}`,
          atelierId: atelier.id,
          planId: plan.id,
          planNom: plan.nom,
          dureeMois: 1,
          prix: "5000",
          statut: "SUSPENDU",
          dateDebut: new Date(Date.now() - 5 * JOUR),
          dateExpiration: new Date(Date.now() + 25 * JOUR),
        },
      });
      const e = await etat();
      assert.equal(e.statut, "SUSPENDU");
      assert.equal((await nouvelleCliente("90006002")).status, 402);
      await prisma.abonnement.delete({ where: { id: ab.id } });
    });
  });

  test("la durée de grâce est lue dans les réglages de la plateforme", async () => {
    await finEssai(9); // 9 jours : lecture seule avec 7 jours de grâce, période de grâce avec 10
    assert.equal((await nouvelleCliente("90007001")).status, 402);
    assert.equal((await superApi.put("/api/plateforme/parametres-abonnement", { joursGrace: 10 })).status, 200);
    try {
      assert.equal((await etat()).acces.mode, "GRACE");
      assert.equal((await nouvelleCliente("90007002")).status, 201);
    } finally {
      await superApi.put("/api/plateforme/parametres-abonnement", { joursGrace: 7 });
    }
  });

  test("souscrire puis faire confirmer le paiement rétablit l'écriture immédiatement", async () => {
    await finEssai(30);
    assert.equal((await nouvelleCliente("90008001")).status, 402);
    const decl = await api.post("/api/abonnements/souscrire", {
      planId: plan.id,
      dureeMois: 1,
      moyenPaiement: "MOBILE_MONEY",
      reference: "RO-REF-1",
    });
    assert.equal(decl.status, 201, "la souscription reste possible en lecture seule");
    assert.equal((await nouvelleCliente("90008001")).status, 402, "une déclaration n'accorde aucun accès");
    assert.equal((await superApi.post(`/api/plateforme/transactions/${decl.body.id}/confirmer`, {})).status, 200);
    assert.equal((await etat()).acces.mode, "COMPLET");
    assert.equal((await nouvelleCliente("90008001")).status, 201);
  });
});
