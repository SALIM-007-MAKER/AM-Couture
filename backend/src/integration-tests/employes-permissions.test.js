// Employés et permissions : création par le PDG, accès strictement limité aux permissions accordées, absence totale de
// fuite financière vers un employé sans « finances.voir », effet immédiat des changements, isolation entre ateliers,
// interaction avec l'abonnement. Base Postgres jetable dédiée (voir preload.js).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, creerCliente, creerCommande, supprimerAtelier } from "./helpers.js";

const JOUR = 86_400_000;
const MDP = "Atelier-Test-2026!";
const MDP_PDG = "password123"; // mot de passe par défaut de creerAtelierEtAdmin
const marque = `${process.pid}-${Date.now()}`;

const CLES_FINANCIERES = ["prixTotal", "totalPaye", "solde", "statutPaiement", "paiements", "montantRestant", "prixIndicatif", "prixUnitaire"];
const contientCle = (objet, cle) => JSON.stringify(objet).includes(`"${cle}"`);

describe("Employés et permissions", () => {
  let server, baseUrl;
  let A, B; // ateliers
  let pdgA, pdgB, superApi, superId;
  let cliente, commandePayee, commandeImpayee, modele, article;
  const employes = {}; // nom court → { id, identifiant, api }
  let n = 0;

  async function connecter(identifiant, password = MDP) {
    const api = client(baseUrl);
    const res = await api.post("/api/auth/login", { identifiant, password });
    assert.equal(res.status, 200, `connexion ${identifiant} : ${JSON.stringify(res.body)}`);
    return api;
  }

  /** Crée un employé directement en base (rapide), avec ses permissions normalisées, puis ouvre sa session. */
  async function creerEmploye(nom, { atelierId = A.atelier.id, permissions, poste = "AUTRE" }) {
    const identifiant = `emp-${nom}-${marque}-${++n}`;
    const employe = await prisma.user.create({
      data: {
        identifiant,
        passwordHash: await bcrypt.hash(MDP, 4),
        role: "EMPLOYE",
        atelierId,
        prenom: "Emp",
        nom,
        poste,
        permissions,
      },
    });
    employes[nom] = { id: employe.id, identifiant, api: await connecter(identifiant) };
    return employes[nom];
  }

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const ra = await creerAtelierEtAdmin({ nom: "Atelier Employés A" });
    const rb = await creerAtelierEtAdmin({ nom: "Atelier Employés B" });
    A = { atelier: ra.atelier };
    B = { atelier: rb.atelier };
    pdgA = client(baseUrl);
    pdgB = client(baseUrl);
    assert.equal((await pdgA.post("/api/auth/login", { identifiant: ra.identifiant, password: ra.password })).status, 200);
    assert.equal((await pdgB.post("/api/auth/login", { identifiant: rb.identifiant, password: rb.password })).status, 200);

    const identifiantSuper = `superadmin-emp-${marque}`;
    superId = (await prisma.user.create({ data: { identifiant: identifiantSuper, passwordHash: await bcrypt.hash(MDP, 4), role: "SUPERADMIN" } })).id;
    superApi = client(baseUrl);
    assert.equal((await superApi.post("/api/auth/login", { identifiant: identifiantSuper, password: MDP })).status, 200);

    // Données de l'atelier A : tout ce qu'un employé ne doit voir qu'avec les bons droits.
    cliente = await creerCliente(A.atelier.id, { nom: "Awa", prenom: "Test", telephone: "90111111" });
    await prisma.mesure.create({ data: { clienteId: cliente.id, taille: "70" } });
    commandePayee = await creerCommande(A.atelier.id, cliente.id, { prixTotal: "50000" });
    await prisma.paiement.create({ data: { commandeId: commandePayee.id, montant: "20000", mode: "ESPECES" } });
    commandeImpayee = await creerCommande(A.atelier.id, cliente.id, { prixTotal: "30000" });
    modele = await prisma.modele.create({ data: { atelierId: A.atelier.id, nom: `Boubou ${marque}`, categorie: "BOUBOU", prixIndicatif: "15000" } });
    article = await prisma.articleStock.create({ data: { atelierId: A.atelier.id, nom: `Tissu ${marque}`, unite: "METRE", prixUnitaire: "2500", seuilAlerte: "5" } });
    await prisma.depense.create({ data: { atelierId: A.atelier.id, categorie: "Loyer", montant: "70000" } });
    await prisma.livraison.create({ data: { commandeId: commandePayee.id, montantRestant: "30000" } }).catch(() => {});
    // Une cliente d'un AUTRE atelier : ne doit jamais apparaître chez A.
    await creerCliente(B.atelier.id, { nom: "Secrète", prenom: "Beta", telephone: "90222222" });
  });

  after(async () => {
    await arreterServeur(server);
    for (const at of [A.atelier, B.atelier]) {
      await prisma.journalSecurite.deleteMany({ where: { atelierId: at.id } });
      await supprimerAtelier(at.id);
    }
    await prisma.user.delete({ where: { id: superId } });
    await prisma.$disconnect();
  });

  describe("création par le PDG", () => {
    it("un poste fournit les permissions de départ ; le mot de passe n'est jamais renvoyé", async () => {
      const res = await pdgA.post("/api/employes", {
        identifiant: `couturier-${marque}`,
        password: MDP,
        prenom: "Moussa",
        nom: "Couturier",
        poste: "COUTURIER",
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.poste, "COUTURIER");
      assert.deepEqual(res.body.permissions, ["clientes.lire", "commandes.lire", "commandes.statut", "modeles.lire", "notifications.lire", "stock.lire"]);
      assert.equal(res.body.actif, true);
      assert.ok(!JSON.stringify(res.body).includes("passwordHash"));
      assert.ok(!JSON.stringify(res.body).includes(MDP));
      const enBase = await prisma.user.findUnique({ where: { id: res.body.id } });
      assert.equal(enBase.role, "EMPLOYE");
      assert.equal(enBase.atelierId, A.atelier.id);
      employes.parApi = { id: res.body.id, identifiant: `couturier-${marque}` };
    });

    it("les droits sensibles exigent le mot de passe du PDG : absent, faux, puis correct", async () => {
      const corps = { identifiant: `compta-${marque}`, password: MDP, prenom: "Aminata", nom: "Compta", poste: "COMPTABLE" };
      const sans = await pdgA.post("/api/employes", corps);
      assert.equal(sans.status, 403);
      assert.ok(sans.body.details.confirmationMotDePasse);
      const faux = await pdgA.post("/api/employes", { ...corps, confirmationMotDePasse: "pas-le-bon-mdp" });
      assert.equal(faux.status, 403);
      assert.equal(await prisma.user.count({ where: { identifiant: corps.identifiant } }), 0, "aucun compte créé tant que la confirmation échoue");
      const ok = await pdgA.post("/api/employes", { ...corps, confirmationMotDePasse: MDP_PDG });
      assert.equal(ok.status, 201);
      assert.ok(ok.body.permissions.includes("finances.voir"));
      employes.comptaApi = { id: ok.body.id };
    });

    it("valide les champs : permission inconnue (nommée), poste inconnu, mot de passe faible, doublon", async () => {
      const base = { identifiant: `x-${marque}`, password: MDP, prenom: "X", nom: "Y" };
      const inconnue = await pdgA.post("/api/employes", { ...base, permissions: ["clientes.lire", "employes.gerer"] });
      assert.equal(inconnue.status, 400);
      assert.match(inconnue.body.details.permissions[0], /employes\.gerer/);
      assert.equal((await pdgA.post("/api/employes", { ...base, poste: "ROI" })).status, 400);
      assert.equal((await pdgA.post("/api/employes", { ...base, password: "12345678" })).status, 400);
      assert.equal((await pdgA.post("/api/employes", { ...base, identifiant: `couturier-${marque}` })).status, 409);
      assert.equal((await pdgA.post("/api/employes", { ...base, role: "ADMIN" })).status, 400, "champ inconnu refusé : pas d'escalade de rôle à la création");
    });

    it("une permission d'écriture ajoute la lecture ; un champ de poste ne réécrit pas les droits", async () => {
      const res = await pdgA.post("/api/employes", { identifiant: `stock-${marque}`, password: MDP, prenom: "S", nom: "Stock", permissions: ["stock.ecrire"] });
      assert.equal(res.status, 201);
      assert.deepEqual(res.body.permissions, ["stock.ecrire", "stock.lire"]);
      const maj = await pdgA.patch(`/api/employes/${res.body.id}`, { poste: "MAGASINIER" });
      assert.equal(maj.status, 200);
      assert.deepEqual(maj.body.permissions, ["stock.ecrire", "stock.lire"], "changer de poste ne modifie pas les permissions accordées");
    });
  });

  describe("isolation entre ateliers", () => {
    it("le PDG de B ne voit, ne modifie ni ne désactive les employés de A (404) ; la liste est cloisonnée", async () => {
      const id = employes.parApi.id;
      assert.equal((await pdgB.get(`/api/employes/${id}`)).status, 404);
      assert.equal((await pdgB.patch(`/api/employes/${id}`, { nom: "Piraté" })).status, 404);
      assert.equal((await pdgB.post(`/api/employes/${id}/desactiver`, {})).status, 404);
      assert.equal((await pdgB.post(`/api/employes/${id}/mot-de-passe`, { nouveauMotDePasse: "Nouveau-Mdp-2026!", confirmationMotDePasse: MDP_PDG })).status, 404);
      const liste = await pdgB.get("/api/employes?actif=all");
      assert.equal(liste.status, 200);
      assert.equal(liste.body.data.length, 0);
      assert.equal((await prisma.user.findUnique({ where: { id } })).nom, "Couturier");
    });

    it("un employé de A ne voit rien de B, même avec toutes les permissions", async () => {
      const tout = await creerEmploye("toutes", {
        permissions: ["clientes.lire", "clientes.ecrire", "commandes.lire", "commandes.ecrire", "paiements.lire", "paiements.ecrire", "finances.voir", "stock.lire", "depenses.lire"],
      });
      const liste = await tout.api.get("/api/clientes?pageSize=100");
      assert.equal(liste.status, 200);
      assert.ok(!JSON.stringify(liste.body).includes("Secrète"));
      assert.ok(JSON.stringify(liste.body).includes("Awa"));
    });

    it("un compte ADMIN ou une cliente reste invisible de l'API employés (404)", async () => {
      const admin = await prisma.user.findFirst({ where: { atelierId: A.atelier.id, role: "ADMIN" } });
      assert.equal((await pdgA.get(`/api/employes/${admin.id}`)).status, 404);
      assert.equal((await pdgA.post(`/api/employes/${admin.id}/desactiver`, {})).status, 404);
      assert.equal((await prisma.user.findUnique({ where: { id: admin.id } })).actif, true);
    });
  });

  describe("l'administration n'est jamais déléguée", () => {
    it("un employé, quelles que soient ses permissions, ne gère ni employés, ni paramètres, ni abonnement, ni la plateforme", async () => {
      const { api } = employes.toutes;
      for (const [methode, chemin, corps] of [
        ["GET", "/api/employes"],
        ["POST", "/api/employes", { identifiant: "x-intrus", password: MDP, prenom: "I", nom: "I" }],
        ["PATCH", `/api/employes/${employes.parApi.id}`, { nom: "X" }],
        ["PUT", "/api/parametres", { nom: "Mon atelier", devise: "FCFA" }],
        ["PATCH", "/api/parametres", { slogan: "x" }],
        ["POST", "/api/abonnements/souscrire", { planId: "x", dureeMois: 1, moyenPaiement: "ESPECES" }],
        ["GET", "/api/abonnements/transactions"],
        ["GET", "/api/plateforme/transactions"],
        ["GET", "/api/ateliers"],
        ["GET", "/api/plateforme/commerce/synthese"],
      ]) {
        const res = await api[methode.toLowerCase()](chemin, corps);
        assert.equal(res.status, 403, `${methode} ${chemin} → ${res.status}`);
      }
      assert.equal(await prisma.user.count({ where: { identifiant: "x-intrus" } }), 0);
    });

    it("il peut lire les paramètres de l'atelier et un état d'accès réduit, sans aucun montant", async () => {
      const { api } = employes.toutes;
      assert.equal((await api.get("/api/parametres")).status, 200);
      const etat = await api.get("/api/abonnements/etat");
      assert.equal(etat.status, 200);
      assert.deepEqual(Object.keys(etat.body).sort(), ["acces", "essai", "statut"]);
    });

    it("/auth/me indique rôle, poste et permissions ; il ne permet pas de s'en attribuer", async () => {
      const { api, id } = employes.toutes;
      const me = await api.get("/api/auth/me");
      assert.equal(me.body.role, "EMPLOYE");
      assert.ok(me.body.permissions.includes("clientes.lire"));
      const avant = (await prisma.user.findUnique({ where: { id } })).permissions;
      await api.patch("/api/compte", { langue: "fr", permissions: ["finances.voir"], role: "ADMIN" });
      const apres = await prisma.user.findUnique({ where: { id } });
      assert.deepEqual(apres.permissions, avant);
      assert.equal(apres.role, "EMPLOYE");
    });

    it("le SUPERADMIN n'a pas accès à la gestion des employés d'un atelier (403)", async () => {
      assert.equal((await superApi.get("/api/employes")).status, 403);
    });
  });

  describe("sans permission : aucun accès, aucune fuite", () => {
    it("un employé sans aucune permission reçoit 403 sur toutes les routes métier, lecture et écriture", async () => {
      const { api } = await creerEmploye("rien", { permissions: [] });
      const routes = [
        ["GET", "/api/clientes"],
        ["GET", `/api/clientes/${cliente.id}/totaux`],
        ["GET", `/api/clientes/${cliente.id}/mesures`],
        ["POST", "/api/clientes", { nom: "X", prenom: "Y", telephone: "90333333" }],
        ["GET", "/api/modeles"],
        ["GET", "/api/commandes"],
        ["GET", "/api/commandes/export"],
        ["GET", `/api/commandes/${commandePayee.id}`],
        ["GET", `/api/commandes/${commandePayee.id}/fiche-pdf`],
        ["PATCH", `/api/commandes/${commandePayee.id}`, { couleur: "rouge" }],
        ["POST", `/api/commandes/${commandePayee.id}/statut`, { statut: "EN_CONFECTION" }],
        ["GET", `/api/commandes/${commandePayee.id}/paiements`],
        ["POST", `/api/commandes/${commandePayee.id}/paiements`, { montant: "100", mode: "ESPECES" }],
        ["GET", `/api/commandes/${commandePayee.id}/livraisons`],
        ["GET", "/api/paiements"],
        ["GET", "/api/livraisons"],
        ["GET", "/api/recus"],
        ["GET", "/api/depenses"],
        ["POST", "/api/depenses", { categorie: "Tissu", montant: "100" }],
        ["GET", "/api/stock"],
        ["POST", `/api/stock/${article.id}/mouvements`, { type: "ENTREE", quantite: "1" }],
        ["GET", "/api/demandes"],
        ["GET", "/api/dashboard/summary"],
        ["GET", "/api/dashboard/recent"],
        ["GET", "/api/rapports/commandes"],
        ["GET", "/api/rapports/finances"],
        ["GET", "/api/notifications"],
        ["GET", "/api/notifications/nombre-non-lues"],
      ];
      for (const [methode, chemin, corps] of routes) {
        const res = await api[methode.toLowerCase()](chemin, corps);
        assert.equal(res.status, 403, `${methode} ${chemin} → ${res.status}`);
        assert.ok(!JSON.stringify(res.body).includes("Awa"), `${chemin} ne doit rien révéler`);
      }
    });
  });

  describe("couturier : travaille sans voir l'argent", () => {
    let api;
    before(async () => {
      ({ api } = await creerEmploye("couturier", { poste: "COUTURIER", permissions: ["clientes.lire", "commandes.lire", "commandes.statut", "modeles.lire", "stock.lire", "notifications.lire"] }));
    });

    it("lit les commandes (liste et détail) sans aucun montant", async () => {
      const liste = await api.get("/api/commandes");
      assert.equal(liste.status, 200);
      assert.ok(liste.body.data.length >= 2);
      for (const cle of CLES_FINANCIERES) assert.ok(!contientCle(liste.body, cle), `liste : « ${cle} » présent`);
      const detail = await api.get(`/api/commandes/${commandePayee.id}`);
      assert.equal(detail.status, 200);
      assert.equal(detail.body.numero, commandePayee.numero);
      for (const cle of CLES_FINANCIERES) assert.ok(!contientCle(detail.body, cle), `détail : « ${cle} » présent`);
    });

    it("le PDG, lui, voit les montants des mêmes commandes", async () => {
      const detail = await pdgA.get(`/api/commandes/${commandePayee.id}`);
      assert.equal(detail.body.prixTotal, "50000");
      assert.equal(detail.body.totalPaye, "20000");
      assert.ok(Array.isArray(detail.body.paiements));
    });

    it("modèles et stock sans prix ; l'export du stock sans colonne de prix", async () => {
      const modeles = await api.get("/api/modeles");
      assert.equal(modeles.status, 200);
      assert.ok(!contientCle(modeles.body, "prixIndicatif"));
      const stock = await api.get("/api/stock");
      assert.equal(stock.status, 200);
      assert.ok(!contientCle(stock.body, "prixUnitaire"));
      const csvEmploye = await fetch(`${baseUrl}/api/stock/export`, { headers: { Cookie: api.cookie() } });
      assert.equal(csvEmploye.status, 200);
      const enTete = (await csvEmploye.text()).split("\n")[0];
      assert.ok(!/Prix unitaire/.test(enTete), enTete);
      const csvPdg = await fetch(`${baseUrl}/api/stock/export`, { headers: { Cookie: pdgA.cookie() } });
      assert.match((await csvPdg.text()).split("\n")[0], /Prix unitaire/);
    });

    it("peut faire avancer une commande mais ni la créer, ni la modifier, ni voir un export ni les totaux d'une cliente", async () => {
      const statut = await api.post(`/api/commandes/${commandeImpayee.id}/statut`, { statut: "EN_CONFECTION" });
      assert.equal(statut.status, 200);
      assert.equal(statut.body.statut, "EN_CONFECTION");
      assert.equal((await api.patch(`/api/commandes/${commandeImpayee.id}`, { couleur: "bleu" })).status, 403);
      assert.equal((await api.post("/api/commandes", { clienteId: cliente.id, typeVetement: "ROBE", prixTotal: "1000", dateLivraisonPrevue: new Date(Date.now() + 5 * JOUR).toISOString() })).status, 403);
      assert.equal((await api.get("/api/commandes/export")).status, 403);
      assert.equal((await api.get(`/api/clientes/${cliente.id}/totaux`)).status, 403);
      assert.equal((await api.post("/api/clientes", { nom: "N", prenom: "P", telephone: "90444444" })).status, 403);
    });

    it("la fiche de travail en PDF est disponible", async () => {
      const res = await fetch(`${baseUrl}/api/commandes/${commandePayee.id}/fiche-pdf`, { headers: { Cookie: api.cookie() } });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "application/pdf");
    });

    it("aucune route d'argent : paiements, dépenses, reçus, rapports financiers, tableau de bord", async () => {
      for (const chemin of ["/api/paiements", "/api/recus", "/api/depenses", "/api/rapports/finances", "/api/dashboard/summary", `/api/commandes/${commandePayee.id}/paiements`]) {
        assert.equal((await api.get(chemin)).status, 403, chemin);
      }
    });

    it("notifications : alertes d'impayé et compteur de demandes absents ; aucune modification de l'état partagé", async () => {
      const pdg = await pdgA.get("/api/notifications?pageSize=100");
      assert.ok(pdg.body.data.some((x) => x.type === "IMPAYE"), "le PDG voit l'alerte d'impayé");
      const emp = await api.get("/api/notifications?pageSize=100");
      assert.equal(emp.status, 200);
      assert.ok(!emp.body.data.some((x) => x.type === "IMPAYE"));
      assert.ok(!contientCle(emp.body, "prixTotal"));
      const id = emp.body.data[0]?.id ?? pdg.body.data[0].id;
      assert.equal((await api.patch(`/api/notifications/${id}`, { lu: true })).status, 403);
      assert.equal((await api.post("/api/notifications/marquer-lu", { ids: [id] })).status, 403);
      assert.equal((await prisma.notification.findUnique({ where: { id } })).lu, false);
    });
  });

  describe("réceptionniste : crée les commandes, pas l'argent", () => {
    let api;
    before(async () => {
      ({ api } = await creerEmploye("reception", {
        poste: "RECEPTIONNISTE",
        permissions: ["clientes.lire", "clientes.ecrire", "modeles.lire", "commandes.lire", "commandes.ecrire", "livraisons.lire", "livraisons.ecrire", "demandes.lire", "demandes.ecrire", "dashboard.lire", "notifications.lire"],
      }));
    });
    const corpsCommande = () => ({
      clienteId: cliente.id,
      typeVetement: "ROBE",
      prixTotal: "25000",
      dateLivraisonPrevue: new Date(Date.now() + 9 * JOUR).toISOString(),
    });

    it("crée une commande ; la réponse ne contient aucun montant", async () => {
      const res = await api.post("/api/commandes", corpsCommande());
      assert.equal(res.status, 201);
      for (const cle of CLES_FINANCIERES) assert.ok(!contientCle(res.body, cle), `« ${cle} » présent`);
      assert.equal((await prisma.commande.findUnique({ where: { id: res.body.id } })).prixTotal.toString(), "25000");
    });

    it("ne peut pas enregistrer un acompte ni un paiement final de livraison", async () => {
      const acompte = await api.post("/api/commandes", { ...corpsCommande(), paiementInitial: { montant: "5000", mode: "ESPECES" } });
      assert.equal(acompte.status, 403);
      assert.equal(acompte.body.details.permission, "paiements.ecrire");
      const livraison = await api.post(`/api/commandes/${commandeImpayee.id}/livraisons`, { paiementFinal: { montant: "100", mode: "ESPECES" } });
      assert.equal(livraison.status, 403);
      assert.equal(await prisma.paiement.count({ where: { commandeId: commandeImpayee.id } }), 0);
    });

    it("tableau de bord : indicateurs de travail seulement, ni finances, ni valeur, ni impayés", async () => {
      const resume = await api.get("/api/dashboard/summary");
      assert.equal(resume.status, 200);
      assert.ok(!("finances" in resume.body));
      assert.ok(!("valeurTotale" in resume.body.commandes));
      assert.ok(!("nonPayees" in resume.body.commandes));
      assert.equal(typeof resume.body.commandes.enCours, "number");
      const recent = await api.get("/api/dashboard/recent");
      assert.equal(recent.status, 200);
      assert.ok(!("paiements" in recent.body));
      assert.ok(!("depenses" in recent.body));
      assert.ok(!contientCle(recent.body, "prixTotal"));
      const pdg = await pdgA.get("/api/dashboard/summary");
      assert.ok(pdg.body.finances);
      assert.ok("valeurTotale" in pdg.body.commandes);
    });
  });

  describe("comptable : voit l'argent, n'administre rien", () => {
    let api;
    before(async () => {
      ({ api } = await creerEmploye("comptable", { poste: "COMPTABLE", permissions: ["clientes.lire", "commandes.lire", "paiements.lire", "paiements.ecrire", "depenses.lire", "depenses.ecrire", "finances.voir", "rapports.lire", "dashboard.lire", "notifications.lire"] }));
    });

    it("voit les montants, enregistre un paiement, lit les dépenses et les rapports financiers", async () => {
      const detail = await api.get(`/api/commandes/${commandePayee.id}`);
      assert.equal(detail.body.prixTotal, "50000");
      const paiement = await api.post(`/api/commandes/${commandePayee.id}/paiements`, { montant: "5000", mode: "ESPECES" });
      assert.equal(paiement.status, 201);
      assert.equal((await api.get("/api/depenses")).status, 200);
      assert.equal((await api.get("/api/rapports/finances")).status, 200);
      assert.equal((await api.get("/api/commandes/export")).status, 200);
    });

    it("ne peut ni créer des clientes, ni gérer les employés ni l'abonnement", async () => {
      assert.equal((await api.post("/api/clientes", { nom: "N", prenom: "P", telephone: "90555555" })).status, 403);
      assert.equal((await api.get("/api/employes")).status, 403);
      assert.equal((await api.get("/api/abonnements/transactions")).status, 403);
    });
  });

  describe("effet immédiat des changements", () => {
    it("retirer une permission coupe l'accès à la requête suivante, sur la même session", async () => {
      const { api, id } = await creerEmploye("immediat", { permissions: ["clientes.lire"] });
      assert.equal((await api.get("/api/clientes")).status, 200);
      const maj = await pdgA.patch(`/api/employes/${id}`, { permissions: [] });
      assert.equal(maj.status, 200);
      assert.equal((await api.get("/api/clientes")).status, 403);
    });

    it("ajouter un droit sensible exige le mot de passe du PDG ; en retirer jamais", async () => {
      const { id } = await creerEmploye("sensible", { permissions: ["clientes.lire", "depenses.lire"] });
      const sans = await pdgA.patch(`/api/employes/${id}`, { permissions: ["clientes.lire", "depenses.lire", "finances.voir"] });
      assert.equal(sans.status, 403);
      assert.deepEqual((await prisma.user.findUnique({ where: { id } })).permissions, ["clientes.lire", "depenses.lire"]);
      const retrait = await pdgA.patch(`/api/employes/${id}`, { permissions: ["clientes.lire"] });
      assert.equal(retrait.status, 200);
      const avec = await pdgA.patch(`/api/employes/${id}`, { permissions: ["clientes.lire", "finances.voir"], confirmationMotDePasse: MDP_PDG });
      assert.equal(avec.status, 200);
      assert.ok(avec.body.permissions.includes("finances.voir"));
    });

    it("désactiver : la session ouverte est coupée immédiatement, la connexion refusée, rien n'est supprimé ; réactiver rétablit", async () => {
      const { api, id, identifiant } = await creerEmploye("sortant", { permissions: ["clientes.lire"] });
      assert.equal((await api.get("/api/clientes")).status, 200);
      const off = await pdgA.post(`/api/employes/${id}/desactiver`, { motif: "Départ" });
      assert.equal(off.status, 200);
      assert.equal(off.body.actif, false);
      assert.ok(off.body.desactiveLe);
      assert.equal((await api.get("/api/clientes")).status, 401, "la session ouverte ne survit pas");
      const tentative = await client(baseUrl).post("/api/auth/login", { identifiant, password: MDP });
      assert.equal(tentative.status, 403);
      assert.match(tentative.body.error, /désactivé/);
      assert.equal(await prisma.user.count({ where: { id } }), 1, "le compte n'est pas supprimé");
      assert.equal((await pdgA.post(`/api/employes/${id}/desactiver`, {})).body.dejaTraite, true);
      assert.equal((await pdgA.get("/api/employes?actif=true")).body.data.some((e) => e.id === id), false);
      assert.equal((await pdgA.get("/api/employes?actif=false")).body.data.some((e) => e.id === id), true);

      assert.equal((await pdgA.post(`/api/employes/${id}/reactiver`, {})).status, 200);
      const retour = await connecter(identifiant);
      assert.equal((await retour.get("/api/clientes")).status, 200);
    });

    it("l'état « désactivé » suffit à lui seul à couper une session, même sans changement de version de session", async () => {
      const { api, id } = await creerEmploye("dbdirect", { permissions: ["clientes.lire"] });
      assert.equal((await api.get("/api/clientes")).status, 200);
      await prisma.user.update({ where: { id }, data: { actif: false } }); // sans toucher à sessionVersion
      assert.equal((await api.get("/api/clientes")).status, 401);
    });

    it("mauvais mot de passe sur un compte désactivé : pas de révélation de l'état", async () => {
      const { id, identifiant } = await creerEmploye("discret", { permissions: [] });
      await pdgA.post(`/api/employes/${id}/desactiver`, {});
      const faux = await client(baseUrl).post("/api/auth/login", { identifiant, password: "mauvais-mot-de-passe" });
      assert.equal(faux.status, 401);
      assert.match(faux.body.error, /incorrect/);
    });

    it("réinitialiser le mot de passe : confirmé par le PDG, coupe les sessions de l'employé", async () => {
      const { api, id, identifiant } = await creerEmploye("mdp", { permissions: ["clientes.lire"] });
      const NOUVEAU = "Nouveau-Mdp-Couture-2026!";
      assert.equal((await pdgA.post(`/api/employes/${id}/mot-de-passe`, { nouveauMotDePasse: NOUVEAU })).status, 400);
      assert.equal((await pdgA.post(`/api/employes/${id}/mot-de-passe`, { nouveauMotDePasse: NOUVEAU, confirmationMotDePasse: "faux" })).status, 403);
      assert.equal((await api.get("/api/clientes")).status, 200, "échec de confirmation : rien n'a changé");
      assert.equal((await pdgA.post(`/api/employes/${id}/mot-de-passe`, { nouveauMotDePasse: NOUVEAU, confirmationMotDePasse: MDP_PDG })).status, 204);
      assert.equal((await api.get("/api/clientes")).status, 401);
      assert.equal((await client(baseUrl).post("/api/auth/login", { identifiant, password: MDP })).status, 401);
      assert.equal((await client(baseUrl).post("/api/auth/login", { identifiant, password: NOUVEAU })).status, 200);
    });

    it("la session du PDG n'est jamais affectée par ces opérations", async () => {
      assert.equal((await pdgA.get("/api/clientes")).status, 200);
    });
  });

  describe("interaction avec l'abonnement", () => {
    it("lecture seule : l'employé lit encore avec ses droits, mais ne peut plus écrire ; le PDG ne peut plus créer d'employé", async () => {
      const { api } = await creerEmploye("abo", { permissions: ["clientes.lire", "clientes.ecrire"] });
      await prisma.atelier.update({ where: { id: A.atelier.id }, data: { trialEndsAt: new Date(Date.now() - 60 * JOUR) } });
      try {
        assert.equal((await api.get("/api/clientes")).status, 200);
        const ecriture = await api.post("/api/clientes", { nom: "N", prenom: "P", telephone: "90666666" });
        assert.equal(ecriture.status, 402);
        assert.equal(ecriture.body.details.lectureSeule, true);
        const etat = await api.get("/api/abonnements/etat");
        assert.equal(etat.body.acces.mode, "LECTURE_SEULE");
        const creation = await pdgA.post("/api/employes", { identifiant: `ro-${marque}`, password: MDP, prenom: "R", nom: "O" });
        assert.equal(creation.status, 402);
        assert.equal((await pdgA.get("/api/employes")).status, 200, "la consultation reste possible");
      } finally {
        await prisma.atelier.update({ where: { id: A.atelier.id }, data: { trialEndsAt: null } });
      }
    });

    it("un atelier suspendu par la plateforme coupe aussi ses employés", async () => {
      const { api } = await creerEmploye("susp", { permissions: ["clientes.lire"] });
      await prisma.atelier.update({ where: { id: A.atelier.id }, data: { actif: false } });
      try {
        assert.equal((await api.get("/api/clientes")).status, 403);
      } finally {
        await prisma.atelier.update({ where: { id: A.atelier.id }, data: { actif: true } });
      }
    });
  });

  describe("impersonation et traçabilité", () => {
    it("pendant une impersonation, le SUPERADMIN peut créer un employé simple mais pas accorder un droit sensible (mot de passe du PDG inconnu)", async () => {
      const pdg = await prisma.user.findFirst({ where: { atelierId: A.atelier.id, role: "ADMIN" } });
      const imp = await superApi.post(`/api/ateliers/${A.atelier.id}/comptes/${pdg.id}/impersonation`, {});
      assert.equal(imp.status, 200);
      const simple = await superApi.post("/api/employes", { identifiant: `imp-${marque}`, password: MDP, prenom: "I", nom: "M", poste: "AUTRE" });
      assert.equal(simple.status, 201);
      const sensible = await superApi.post("/api/employes", { identifiant: `imp2-${marque}`, password: MDP, prenom: "I", nom: "M", poste: "COMPTABLE", confirmationMotDePasse: MDP_PDG });
      assert.equal(sensible.status, 403);
      assert.match(sensible.body.error, /impersonation/);
      await superApi.post("/api/auth/quitter-impersonation", {});
    });

    it("chaque opération laisse une trace dans le journal de sécurité", async () => {
      const evenements = (await prisma.journalSecurite.findMany({ where: { atelierId: A.atelier.id, evenement: { startsWith: "EMPLOYE_" } } })).map((e) => e.evenement);
      for (const attendu of ["EMPLOYE_CREE", "EMPLOYE_PERMISSIONS_MODIFIEES", "EMPLOYE_DESACTIVE", "EMPLOYE_REACTIVE", "EMPLOYE_MDP_REINITIALISE", "EMPLOYE_CONFIRMATION_ECHEC"]) {
        assert.ok(evenements.includes(attendu), `journal sans ${attendu}`);
      }
    });
  });
});
