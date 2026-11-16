// Demandes de commande depuis la vitrine publique (7.3) : visiteur SANS compte, consentement, anti-abus, aucune donnée
// qui fuit, rattachement à une fiche cliente, purge des données personnelles. Base Postgres jetable dédiée.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { normaliserPermissions } from "../lib/permissions.js";
import { purgerDemandesPubliques } from "../lib/demandesPubliques.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, creerCliente, creerCommande, supprimerAtelier } from "./helpers.js";

const JOUR = 86_400_000;
const MDP = "Atelier-Test-2026!";
const marque = `${process.pid}-${Date.now()}`;
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
let tel = 770000000;
const nouveauTel = () => `+221${tel++}`;

describe("Demandes de commande depuis la vitrine", () => {
  let server, baseUrl, A, B, pdg, pdgB, gestionnaire, lecteur, slugA, slugB, modeleA, modeleA2, modeleBrouillon, modeleB;
  let n = 0;
  const visiteur = () => client(baseUrl); // IP de test distincte à chaque client
  const demander = (api, slug, corps = {}) =>
    api.post(`/api/public/vitrines/${slug}/demandes`, { prenom: "Fatou", nom: "Visiteuse", telephone: nouveauTel(), consentement: true, ...corps });
  const lignes = (where = {}) => prisma.demandeCommande.findMany({ where: { atelierId: A.id, origine: "VITRINE", ...where }, orderBy: { createdAt: "asc" } });
  const nettoyer = () => prisma.demandeCommande.deleteMany({ where: { atelierId: A.id, origine: "VITRINE" } });

  async function employe(nom, permissions) {
    const identifiant = `dem-${nom}-${marque}-${++n}`;
    await prisma.user.create({
      data: { identifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "EMPLOYE", atelierId: A.id, prenom: nom, nom: "Test", poste: "AUTRE", permissions: normaliserPermissions(permissions) },
    });
    const api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant, password: MDP })).status, 200);
    return api;
  }

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const ra = await creerAtelierEtAdmin({ nom: "Atelier Demandes A" });
    const rb = await creerAtelierEtAdmin({ nom: "Atelier Demandes B" });
    A = ra.atelier;
    B = rb.atelier;
    slugA = `demandes-a-${marque}`.toLowerCase();
    slugB = `demandes-b-${marque}`.toLowerCase();
    pdg = client(baseUrl);
    pdgB = client(baseUrl);
    assert.equal((await pdg.post("/api/auth/login", { identifiant: ra.identifiant, password: ra.password })).status, 200);
    assert.equal((await pdgB.post("/api/auth/login", { identifiant: rb.identifiant, password: rb.password })).status, 200);
    gestionnaire = await employe("gestionnaire", ["demandes.ecrire", "clientes.ecrire"]);
    lecteur = await employe("lecteur", ["demandes.ecrire"]); // peut traiter les demandes mais pas créer de fiche cliente

    const publier = async (api, corps) => {
      const m = (await api.post("/api/modeles", corps)).body;
      assert.equal((await api.post(`/api/modeles/${m.id}/photos`, { image: PNG })).status, 201);
      assert.equal((await api.patch(`/api/modeles/${m.id}`, { publie: true })).status, 200);
      return m;
    };
    modeleA = await publier(pdg, { nom: "Boubou A", categorie: "BOUBOU" });
    modeleA2 = await publier(pdg, { nom: "Robe A", categorie: "ROBE" });
    modeleBrouillon = (await pdg.post("/api/modeles", { nom: "Brouillon A", categorie: "JUPE" })).body;
    modeleB = await publier(pdgB, { nom: "Modèle B", categorie: "ROBE" });
    for (const [api, slug] of [[pdg, slugA], [pdgB, slugB]]) assert.equal((await api.patch("/api/vitrine", { slug, vitrineActive: true })).status, 200);
  });

  after(async () => {
    await arreterServeur(server);
    for (const a of [A, B]) {
      await prisma.journalSecurite.deleteMany({ where: { atelierId: a.id } });
      await supprimerAtelier(a.id);
    }
    await prisma.$disconnect();
  });

  describe("activation (PDG)", () => {
    it("désactivées par défaut : la vitrine l'annonce, et l'envoi répond comme une vitrine inconnue", async () => {
      const page = await visiteur().get(`/api/public/vitrines/${slugA}`);
      assert.equal(page.body.atelier.demandes, false);
      const r = await demander(visiteur(), slugA);
      const inconnue = await demander(visiteur(), "n-existe-pas");
      assert.equal(r.status, 404);
      assert.deepEqual(r.body, inconnue.body);
      assert.equal((await lignes()).length, 0);
    });

    it("on ne peut les activer que si la vitrine l'est ; réglage réservé au PDG", async () => {
      assert.equal((await pdg.patch("/api/vitrine", { vitrineActive: false })).status, 200);
      assert.equal((await pdg.patch("/api/vitrine", { demandesEnLigne: true })).status, 400);
      assert.equal((await pdg.patch("/api/vitrine", { vitrineActive: true, demandesEnLigne: true })).status, 200);
      assert.equal((await gestionnaire.patch("/api/vitrine", { demandesEnLigne: false })).status, 403);
      assert.equal((await visiteur().get(`/api/public/vitrines/${slugA}`)).body.atelier.demandes, true);
    });
  });

  describe("envoi par un visiteur", () => {
    it("enregistre une proposition : réponse muette, coordonnées normalisées, consentement horodaté, rien d'autre créé", async () => {
      const cliente0 = await prisma.cliente.count({ where: { atelierId: A.id } });
      const commande0 = await prisma.commande.count({ where: { atelierId: A.id } });
      const t0 = Date.now();
      const r = await demander(visiteur(), slugA, { prenom: "  Awa ", nom: "Diop", telephone: "+221 77 000 00 01", modeleId: modeleA.id, description: " Pour un mariage ", prixTotal: undefined });
      assert.equal(r.status, 201);
      assert.deepEqual(r.body, { ok: true }); // aucun identifiant renvoyé
      const [d] = await lignes();
      assert.equal(d.origine, "VITRINE");
      assert.equal(d.contactPrenom, "Awa");
      assert.equal(d.contactTelephone, "+221770000001");
      assert.equal(d.modeleId, modeleA.id);
      assert.equal(d.description, "Pour un mariage");
      assert.equal(d.statut, "EN_ATTENTE");
      assert.equal(d.clienteId, null);
      assert.ok(d.consentementLe.getTime() >= t0 - 1000);
      assert.equal(await prisma.cliente.count({ where: { atelierId: A.id } }), cliente0);
      assert.equal(await prisma.commande.count({ where: { atelierId: A.id } }), commande0);
    });

    it("exige le consentement exact et des données valides ; refuse les champs inconnus ; ne stocke rien en cas d'erreur", async () => {
      const avant = (await lignes()).length;
      const mauvais = [
        { consentement: false }, { consentement: "true" }, { consentement: undefined }, { consentement: 1 },
        { telephone: "abc" }, { telephone: "123" }, { prenom: "  " }, { nom: "" }, { prenom: "x".repeat(61) }, { description: "x".repeat(1001) },
        { prixTotal: 1 }, { statut: "ACCEPTEE" }, { atelierId: B.id }, { clienteId: "x" },
        { modeleId: modeleBrouillon.id }, { modeleId: modeleB.id }, { modeleId: "inconnu" },
      ];
      for (const corps of mauvais) {
        const r = await demander(visiteur(), slugA, corps);
        assert.equal(r.status, 400, JSON.stringify(corps));
      }
      assert.equal((await lignes()).length, avant);
    });

    it("piège à robots : champ invisible rempli → succès apparent, rien enregistré", async () => {
      const avant = (await lignes()).length;
      const r = await demander(visiteur(), slugA, { siteWeb: "http://spam.example" });
      assert.equal(r.status, 201);
      assert.deepEqual(r.body, { ok: true });
      assert.equal((await lignes()).length, avant);
    });

    it("double envoi : même personne, même modèle → une seule demande ; autre modèle → une autre", async () => {
      await nettoyer();
      const numero = nouveauTel();
      assert.equal((await demander(visiteur(), slugA, { telephone: numero, modeleId: modeleA.id })).status, 201);
      assert.equal((await demander(visiteur(), slugA, { telephone: numero, modeleId: modeleA.id })).status, 201);
      assert.equal((await lignes({ contactTelephone: numero })).length, 1);
      assert.equal((await demander(visiteur(), slugA, { telephone: numero, modeleId: modeleA2.id })).status, 201);
      assert.equal((await lignes({ contactTelephone: numero })).length, 2);
      // Envois simultanés identiques : toujours une seule ligne.
      const autre = nouveauTel();
      await Promise.all(Array.from({ length: 4 }, () => demander(visiteur(), slugA, { telephone: autre })));
      assert.equal((await lignes({ contactTelephone: autre })).length, 1);
    });

    it("plafonds : 3 demandes par numéro et par jour, 50 demandes en attente par atelier", async () => {
      await nettoyer();
      const numero = nouveauTel();
      const base = { atelierId: A.id, origine: "VITRINE", contactPrenom: "X", contactNom: "Y", contactTelephone: numero, consentementLe: new Date(), statut: "REFUSEE" };
      await prisma.demandeCommande.createMany({ data: [base, base, base] });
      assert.equal((await demander(visiteur(), slugA, { telephone: numero })).status, 429);

      await nettoyer();
      await prisma.demandeCommande.createMany({ data: Array.from({ length: 50 }, (_, i) => ({ ...base, statut: "EN_ATTENTE", contactTelephone: `+2216${String(i).padStart(8, "0")}` })) });
      const r = await demander(visiteur(), slugA);
      assert.equal(r.status, 429);
      await nettoyer();
      assert.equal((await demander(visiteur(), slugA)).status, 201);
    });

    it("limiteur par IP : 5 envois par heure, le sixième est refusé", async () => {
      await nettoyer();
      const meme = visiteur();
      const codes = [];
      for (let i = 0; i < 6; i++) codes.push((await demander(meme, slugA)).status);
      assert.deepEqual(codes, [201, 201, 201, 201, 201, 429]);
    });
  });

  describe("traitement par l'atelier", () => {
    let demandeId;
    before(async () => {
      await nettoyer();
      const tel1 = "+221770009999";
      assert.equal((await demander(visiteur(), slugA, { prenom: "Mariama", nom: "Ba", telephone: tel1, modeleId: modeleA.id })).status, 201);
      demandeId = (await lignes({ contactTelephone: tel1 }))[0].id;
    });

    it("apparaît pour l'atelier avec les coordonnées du visiteur, sans fiche cliente, et compte dans la cloche", async () => {
      const liste = await gestionnaire.get("/api/demandes?statut=EN_ATTENTE");
      const d = liste.body.data.find((x) => x.id === demandeId);
      assert.equal(d.cliente, null);
      assert.equal(d.origine, "VITRINE");
      assert.equal(d.contactNom, "Ba");
      assert.equal(d.modele.nom, "Boubou A");
      assert.ok((await pdg.get("/api/notifications/nombre-non-lues")).body.demandes >= 1);
    });

    it("on ne peut pas accepter avant d'avoir créé la fiche cliente", async () => {
      const r = await pdg.post(`/api/demandes/${demandeId}/accepter`, { commandeId: "x" });
      assert.equal(r.status, 409);
      assert.equal(r.body.details.clienteRequise, true);
    });

    it("créer la fiche exige clientes.ecrire ; l'autre atelier ne voit ni ne rattache rien", async () => {
      assert.equal((await lecteur.post(`/api/demandes/${demandeId}/cliente`, {})).status, 403);
      assert.equal((await pdgB.get(`/api/demandes/${demandeId}`)).status, 404);
      assert.equal((await pdgB.post(`/api/demandes/${demandeId}/cliente`, {})).status, 404);
      assert.equal((await prisma.demandeCommande.findUnique({ where: { id: demandeId } })).clienteId, null);
    });

    it("rattacher crée la fiche, EFFACE les coordonnées de la demande, et se répète sans doublon", async () => {
      const r = await gestionnaire.post(`/api/demandes/${demandeId}/cliente`, {});
      assert.equal(r.status, 200);
      assert.equal(r.body.cliente.nom, "Ba");
      assert.equal(r.body.cliente.telephone, "+221770009999");
      assert.equal(r.body.clienteExistante, false);
      const enBase = await prisma.demandeCommande.findUnique({ where: { id: demandeId } });
      assert.equal(enBase.contactNom, null);
      assert.equal(enBase.contactTelephone, null);
      assert.equal(enBase.consentementLe, null);
      const encore = await gestionnaire.post(`/api/demandes/${demandeId}/cliente`, {});
      assert.equal(encore.body.dejaTraite, true);
      assert.equal(await prisma.cliente.count({ where: { atelierId: A.id, telephone: "+221770009999" } }), 1);
    });

    it("puis le circuit habituel : commande créée, demande acceptée", async () => {
      const d = await prisma.demandeCommande.findUnique({ where: { id: demandeId } });
      await prisma.mesure.create({ data: { clienteId: d.clienteId, taille: "70" } });
      const commande = await creerCommande(A.id, d.clienteId, {});
      const r = await pdg.post(`/api/demandes/${demandeId}/accepter`, { commandeId: commande.id });
      assert.equal(r.status, 200);
      assert.equal(r.body.statut, "ACCEPTEE");
    });

    it("un numéro déjà connu réutilise la fiche existante ; une fiche archivée bloque avec un message clair", async () => {
      const connue = await creerCliente(A.id, { nom: "Connue", prenom: "Déjà", telephone: "+221770008888" });
      await demander(visiteur(), slugA, { telephone: "+221770008888" });
      const d1 = (await lignes({ contactTelephone: "+221770008888" }))[0];
      const r = await pdg.post(`/api/demandes/${d1.id}/cliente`, {});
      assert.equal(r.body.clienteExistante, true);
      assert.equal(r.body.cliente.id, connue.id);
      assert.equal(await prisma.cliente.count({ where: { atelierId: A.id, telephone: "+221770008888" } }), 1);

      const archivee = await creerCliente(A.id, { nom: "Archivée", prenom: "Ancienne", telephone: "+221770007777" });
      await prisma.cliente.update({ where: { id: archivee.id }, data: { archivedAt: new Date() } });
      await demander(visiteur(), slugA, { telephone: "+221770007777" });
      const d2 = (await lignes({ contactTelephone: "+221770007777" }))[0];
      assert.equal((await pdg.post(`/api/demandes/${d2.id}/cliente`, {})).status, 409);
    });

    it("refuser une demande sans fiche fonctionne, sans notification cliente (personne à prévenir)", async () => {
      await demander(visiteur(), slugA, { telephone: "+221770006666" });
      const d = (await lignes({ contactTelephone: "+221770006666" }))[0];
      const avant = await prisma.notificationClient.count({ where: { cliente: { atelierId: A.id } } });
      const r = await pdg.post(`/api/demandes/${d.id}/refuser`, { motifRefus: "Hors de nos services" });
      assert.equal(r.status, 200);
      assert.equal(r.body.statut, "REFUSEE");
      assert.equal(await prisma.notificationClient.count({ where: { cliente: { atelierId: A.id } } }), avant);
    });
  });

  describe("conservation des données personnelles", () => {
    it("purge les demandes sans suite après 30 jours (refusées) ou 90 jours (en attente) — et rien d'autre", async () => {
      await nettoyer();
      const cl = await creerCliente(A.id, { nom: "Gardée", prenom: "Cliente", telephone: "+221770005555" });
      const base = { atelierId: A.id, contactPrenom: "P", contactNom: "N", consentementLe: new Date() };
      const creer = async (extra) => (await prisma.demandeCommande.create({ data: { ...base, origine: "VITRINE", contactTelephone: nouveauTel(), ...extra } })).id;
      const ancienneRefusee = await creer({ statut: "REFUSEE", updatedAt: new Date(Date.now() - 31 * JOUR) });
      const recenteRefusee = await creer({ statut: "REFUSEE", updatedAt: new Date(Date.now() - 10 * JOUR) });
      const ancienneAttente = await creer({ statut: "EN_ATTENTE", createdAt: new Date(Date.now() - 91 * JOUR) });
      const recenteAttente = await creer({ statut: "EN_ATTENTE", createdAt: new Date(Date.now() - 10 * JOUR) });
      const avecFiche = await creer({ statut: "REFUSEE", clienteId: cl.id, contactPrenom: null, contactNom: null, contactTelephone: null, consentementLe: null, updatedAt: new Date(Date.now() - 400 * JOUR) });
      const deLEspaceClient = (await prisma.demandeCommande.create({ data: { atelierId: A.id, clienteId: cl.id, origine: "CLIENT", statut: "REFUSEE", updatedAt: new Date(Date.now() - 400 * JOUR) } })).id;

      const nombre = await purgerDemandesPubliques(prisma);
      assert.ok(nombre >= 2);
      const restantes = new Set((await prisma.demandeCommande.findMany({ where: { atelierId: A.id }, select: { id: true } })).map((x) => x.id));
      assert.ok(!restantes.has(ancienneRefusee) && !restantes.has(ancienneAttente));
      for (const id of [recenteRefusee, recenteAttente, avecFiche, deLEspaceClient]) assert.ok(restantes.has(id), id);
    });

    it("le CHECK en base interdit une demande sans fiche ET sans coordonnées ou sans consentement", async () => {
      await assert.rejects(prisma.demandeCommande.create({ data: { atelierId: A.id, origine: "VITRINE" } }));
      await assert.rejects(prisma.demandeCommande.create({ data: { atelierId: A.id, origine: "VITRINE", contactNom: "N", contactPrenom: "P", contactTelephone: "+221770000000" } })); // sans consentement
    });
  });
});
