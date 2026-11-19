// Listes « en retard » / « à livrer » du tableau de bord : /api/dashboard/commandes/* (dashboard.lire + commandes.lire)
// doivent donner exactement les mêmes données que /api/rapports/commandes/* (rapports.lire), sans ouvrir les rapports à
// un poste qui n'a que dashboard.lire (réceptionniste). Base Postgres jetable dédiée (voir preload.js).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { POSTES } from "../lib/permissions.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, creerCliente, creerCommande, supprimerAtelier } from "./helpers.js";

const JOUR = 86_400_000;
const MDP = "Atelier-Test-2026!";
const marque = `${process.pid}-${Date.now()}`;
const EN_RETARD = "/api/dashboard/commandes/en-retard";
const A_LIVRER = "/api/dashboard/commandes/a-livrer";
const ANCIEN_EN_RETARD = "/api/rapports/commandes/en-retard";
const ANCIEN_A_LIVRER = "/api/rapports/commandes/a-livrer";

describe("Tableau de bord : listes de commandes", () => {
  let server, baseUrl, A, B, pdgA, pdgB;
  let n = 0;
  const num = {}; // nom court → numéro de commande
  const employes = {};

  async function creerEmploye(nom, permissions) {
    const identifiant = `emp-${nom}-${marque}-${++n}`;
    await prisma.user.create({
      data: { identifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "EMPLOYE", atelierId: A.atelier.id, prenom: "Emp", nom, poste: "AUTRE", permissions },
    });
    const api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant, password: MDP })).status, 200);
    employes[nom] = api;
    return api;
  }

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const ra = await creerAtelierEtAdmin({ nom: "Atelier Dash A" });
    const rb = await creerAtelierEtAdmin({ nom: "Atelier Dash B" });
    A = { atelier: ra.atelier };
    B = { atelier: rb.atelier };
    pdgA = client(baseUrl);
    pdgB = client(baseUrl);
    assert.equal((await pdgA.post("/api/auth/login", { identifiant: ra.identifiant, password: ra.password })).status, 200);
    assert.equal((await pdgB.post("/api/auth/login", { identifiant: rb.identifiant, password: rb.password })).status, 200);

    const cliente = await creerCliente(A.atelier.id, { nom: "Diallo", prenom: "Awa" });
    const clienteB = await creerCliente(B.atelier.id, { nom: "Secrète", prenom: "Beta" });
    const cmd = async (cle, ecartJours, extra = {}, atelier = A.atelier, cl = cliente) => {
      const c = await creerCommande(atelier.id, cl.id, { dateLivraisonPrevue: new Date(Date.now() + ecartJours * JOUR), prixTotal: "45000", ...extra });
      num[cle] = c.numero;
    };
    await cmd("retard3", -3);
    await cmd("retard1", -1);
    await cmd("retardLivree", -5, { statut: "LIVREE" }); // jamais « en retard » : statut clos
    await cmd("bientot", 1);
    await cmd("loin", 30); // hors horizon de 3 jours
    await cmd("autreAtelierRetard", -2, {}, B.atelier, clienteB);

    await creerEmploye("receptionniste", POSTES.RECEPTIONNISTE);
    await creerEmploye("sansCommandes", ["dashboard.lire"]);
    await creerEmploye("sansFinances", ["dashboard.lire", "commandes.lire"]);
    await creerEmploye("rapportsSeuls", ["rapports.lire", "commandes.lire"]);
  });

  after(async () => {
    await arreterServeur(server);
    for (const at of [A.atelier, B.atelier]) {
      await prisma.journalSecurite.deleteMany({ where: { atelierId: at.id } });
      await supprimerAtelier(at.id);
    }
    await prisma.$disconnect();
  });

  describe("1. réceptionniste : accès autorisé aux deux nouvelles routes", () => {
    it("en retard : 200, ses commandes en retard, plus en retard d'abord, avec joursDeRetard", async () => {
      const res = await employes.receptionniste.get(`${EN_RETARD}?page=1&pageSize=5`);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.deepEqual(res.body.data.map((c) => c.numero), [num.retard3, num.retard1]);
      assert.deepEqual(res.body.data.map((c) => c.joursDeRetard), [3, 1]);
      assert.equal(res.body.meta.total, 2);
    });

    it("à livrer : 200, uniquement l'horizon demandé", async () => {
      const res = await employes.receptionniste.get(`${A_LIVRER}?page=1&pageSize=5&horizonJours=3`);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.horizonJours, 3);
      assert.deepEqual(res.body.data.map((c) => c.numero), [num.bientot]);
    });
  });

  describe("2. réceptionniste : toujours refusée sur les routes Rapports", () => {
    it("403 sur les deux listes de rapports et sur le routeur en général", async () => {
      for (const url of [ANCIEN_EN_RETARD, ANCIEN_A_LIVRER, "/api/rapports/finances", "/api/rapports/commandes"]) {
        const res = await employes.receptionniste.get(url);
        assert.equal(res.status, 403, `${url} : ${res.status}`);
      }
    });

    it("le poste n'a toujours pas rapports.lire (aucune permission de poste modifiée)", () => {
      assert.ok(!POSTES.RECEPTIONNISTE.includes("rapports.lire"));
      assert.ok(POSTES.RECEPTIONNISTE.includes("dashboard.lire") && POSTES.RECEPTIONNISTE.includes("commandes.lire"));
    });
  });

  describe("3. permissions exigées simultanément", () => {
    it("sans commandes.lire (dashboard.lire seul) : 403 sur les deux routes", async () => {
      assert.equal((await employes.sansCommandes.get(EN_RETARD)).status, 403);
      assert.equal((await employes.sansCommandes.get(A_LIVRER)).status, 403);
    });

    it("sans dashboard.lire (commandes.lire + rapports.lire) : 403 sur les deux routes", async () => {
      assert.equal((await employes.rapportsSeuls.get(EN_RETARD)).status, 403);
      assert.equal((await employes.rapportsSeuls.get(A_LIVRER)).status, 403);
    });

    it("non authentifié : 401", async () => {
      assert.equal((await client(baseUrl).get(EN_RETARD)).status, 401);
    });
  });

  describe("4. PDG : réponses identiques entre anciennes et nouvelles routes", () => {
    it("en retard : mêmes données, même format, même méta", async () => {
      const neuf = await pdgA.get(`${EN_RETARD}?page=1&pageSize=5`);
      const ancien = await pdgA.get(`${ANCIEN_EN_RETARD}?page=1&pageSize=5`);
      assert.equal(neuf.status, 200);
      assert.equal(ancien.status, 200);
      assert.deepEqual(neuf.body, ancien.body);
      assert.ok(neuf.body.data.every((c) => "joursDeRetard" in c && "prixTotal" in c && "cliente" in c));
    });

    it("à livrer : mêmes données, même format, même méta (horizons 3 et 60 jours)", async () => {
      for (const horizonJours of [3, 60]) {
        const q = `?page=1&pageSize=5&horizonJours=${horizonJours}`;
        const neuf = await pdgA.get(`${A_LIVRER}${q}`);
        const ancien = await pdgA.get(`${ANCIEN_A_LIVRER}${q}`);
        assert.equal(neuf.status, 200);
        assert.deepEqual(neuf.body, ancien.body);
      }
    });

    it("les paramètres invalides donnent le même 400 sur les deux", async () => {
      const neuf = await pdgA.get(`${A_LIVRER}?horizonJours=abc`);
      const ancien = await pdgA.get(`${ANCIEN_A_LIVRER}?horizonJours=abc`);
      assert.equal(neuf.status, 400);
      assert.equal(ancien.status, 400);
      assert.deepEqual(neuf.body, ancien.body);
    });
  });

  describe("5. isolation entre deux ateliers", () => {
    it("chaque atelier ne voit que ses commandes, sur les deux routes", async () => {
      const a = await pdgA.get(`${EN_RETARD}?pageSize=50`);
      const b = await pdgB.get(`${EN_RETARD}?pageSize=50`);
      assert.ok(!a.body.data.some((c) => c.numero === num.autreAtelierRetard));
      assert.deepEqual(b.body.data.map((c) => c.numero), [num.autreAtelierRetard]);
      assert.ok(!JSON.stringify(a.body).includes("Secrète"));
      const bLivrer = await pdgB.get(`${A_LIVRER}?pageSize=50&horizonJours=60`);
      assert.equal(bLivrer.body.data.length, 0);
    });

    it("un employé de l'atelier A ne voit rien de l'atelier B", async () => {
      const res = await employes.receptionniste.get(`${EN_RETARD}?pageSize=50`);
      assert.ok(!JSON.stringify(res.body).includes("Secrète"));
    });
  });

  describe("6. masquage des montants", () => {
    it("sans finances.voir : aucun montant dans les deux listes", async () => {
      for (const [api, url] of [
        [employes.receptionniste, `${EN_RETARD}?pageSize=5`],
        [employes.receptionniste, `${A_LIVRER}?pageSize=5&horizonJours=60`],
        [employes.sansFinances, `${EN_RETARD}?pageSize=5`],
      ]) {
        const res = await api.get(url);
        assert.equal(res.status, 200);
        assert.ok(res.body.data.length > 0, "il doit y avoir des lignes à examiner");
        assert.ok(!JSON.stringify(res.body).includes('"prixTotal"'), `montant exposé sur ${url}`);
      }
    });

    it("le PDG, lui, voit les montants", async () => {
      const res = await pdgA.get(`${EN_RETARD}?pageSize=5`);
      assert.ok(res.body.data.every((c) => c.prixTotal === "45000" || Number(c.prixTotal) === 45000));
    });
  });
});
