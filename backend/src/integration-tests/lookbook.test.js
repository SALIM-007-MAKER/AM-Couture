// Lookbook (7.1) : photos de modèles (stockage derrière l'adaptateur), ordre, publication, tags, isolation entre ateliers,
// droits des employés. Base Postgres jetable dédiée (voir preload.js).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { normaliserPermissions } from "../lib/permissions.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";

const MDP = "Atelier-Test-2026!";
const marque = `${process.pid}-${Date.now()}`;

// PNG 1×1 valide (signature réelle) et un faux « PNG » (texte déguisé).
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG = `data:image/png;base64,${PNG_B64}`;
const FAUX = `data:image/png;base64,${Buffer.from("ceci n'est pas une image du tout").toString("base64")}`;
const GRAND = `data:image/png;base64,${Buffer.concat([Buffer.from(PNG_B64, "base64"), Buffer.alloc(2.2 * 1024 * 1024)]).toString("base64")}`;

describe("Lookbook : photos, ordre, publication", () => {
  let server, baseUrl, A, B, pdg, pdgB, lecteur, redacteur, modele;
  let n = 0;

  async function employe(nom, permissions) {
    const identifiant = `look-${nom}-${marque}-${++n}`;
    await prisma.user.create({
      data: { identifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "EMPLOYE", atelierId: A.id, prenom: nom, nom: "Test", poste: "AUTRE", permissions: normaliserPermissions(permissions) },
    });
    const api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant, password: MDP })).status, 200);
    return api;
  }
  const ajouter = (api = pdg, id = modele.id, corps = { image: PNG }) => api.post(`/api/modeles/${id}/photos`, corps);
  const detail = async (api = pdg, id = modele.id) => (await api.get(`/api/modeles/${id}`)).body;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const ra = await creerAtelierEtAdmin({ nom: "Atelier Lookbook A" });
    const rb = await creerAtelierEtAdmin({ nom: "Atelier Lookbook B" });
    A = ra.atelier;
    B = rb.atelier;
    pdg = client(baseUrl);
    pdgB = client(baseUrl);
    assert.equal((await pdg.post("/api/auth/login", { identifiant: ra.identifiant, password: ra.password })).status, 200);
    assert.equal((await pdgB.post("/api/auth/login", { identifiant: rb.identifiant, password: rb.password })).status, 200);
    lecteur = await employe("lecteur", ["modeles.lire"]);
    redacteur = await employe("redacteur", ["modeles.ecrire"]);
    modele = (await pdg.post("/api/modeles", { nom: `Boubou ${marque}`, categorie: "BOUBOU" })).body;
  });

  after(async () => {
    await arreterServeur(server);
    for (const a of [A, B]) {
      await prisma.journalSecurite.deleteMany({ where: { atelierId: a.id } });
      await supprimerAtelier(a.id);
    }
    await prisma.$disconnect();
  });

  it("un nouveau modèle n'est ni publié ni sans tags ; publier sans photo est refusé", async () => {
    assert.equal(modele.publie, false);
    assert.deepEqual(modele.tags, []);
    const r = await pdg.patch(`/api/modeles/${modele.id}`, { publie: true });
    assert.equal(r.status, 409);
    assert.equal((await detail()).publie, false);
  });

  it("ajoute des photos : positions croissantes, URL privée, octets exacts servis avec le bon type", async () => {
    const p1 = await ajouter(pdg, modele.id, { image: PNG, legende: "  Face   avant " });
    const p2 = await ajouter();
    assert.equal(p1.status, 201);
    assert.equal(p1.body.ordre, 0);
    assert.equal(p2.body.ordre, 1);
    assert.equal(p1.body.legende, "Face avant");
    assert.match(p1.body.url, /^\/api\/images\/.+/);
    const d = await detail();
    assert.deepEqual(d.photos.map((p) => p.id), [p1.body.id, p2.body.id]);

    const res = await fetch(`${baseUrl}${p1.body.url}`, { headers: { Cookie: pdg.cookie() } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.match(res.headers.get("cache-control"), /^private/);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), Buffer.from(PNG_B64, "base64"));
  });

  it("refuse un faux fichier image, une image trop lourde, une URL externe, un champ inconnu", async () => {
    assert.equal((await ajouter(pdg, modele.id, { image: FAUX })).status, 400);
    assert.equal((await ajouter(pdg, modele.id, { image: GRAND })).status, 400);
    assert.equal((await ajouter(pdg, modele.id, { image: "https://exemple.test/x.png" })).status, 400);
    assert.equal((await ajouter(pdg, modele.id, { image: PNG, atelierId: B.id })).status, 400);
    assert.equal((await ajouter(pdg, modele.id, {})).status, 400);
    assert.equal(await prisma.imageAtelier.count({ where: { atelierId: A.id } }), 2); // rien d'orphelin
  });

  it("limite à 8 photos, même sous requêtes simultanées", async () => {
    const m = (await pdg.post("/api/modeles", { nom: `Limite ${marque}`, categorie: "ROBE" })).body;
    const reps = await Promise.all(Array.from({ length: 12 }, () => ajouter(pdg, m.id)));
    assert.equal(reps.filter((r) => r.status === 201).length, 8);
    assert.equal(reps.filter((r) => r.status === 409).length, 4);
    const ordres = (await detail(pdg, m.id)).photos.map((p) => p.ordre).sort((a, b) => a - b);
    assert.deepEqual(ordres, [0, 1, 2, 3, 4, 5, 6, 7]); // positions distinctes
    assert.equal(await prisma.imageAtelier.count({ where: { atelierId: A.id } }), 2 + 8); // les refus n'ont rien stocké
  });

  it("réordonne : la liste doit contenir exactement les photos du modèle", async () => {
    const [a, b] = (await detail()).photos;
    const r = await pdg.put(`/api/modeles/${modele.id}/photos/ordre`, { ids: [b.id, a.id] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map((p) => p.id), [b.id, a.id]);
    assert.deepEqual((await detail()).photos.map((p) => p.id), [b.id, a.id]);
    assert.equal((await pdg.put(`/api/modeles/${modele.id}/photos/ordre`, { ids: [a.id] })).status, 400); // incomplète
    assert.equal((await pdg.put(`/api/modeles/${modele.id}/photos/ordre`, { ids: [a.id, a.id] })).status, 400); // doublon
    assert.equal((await pdg.put(`/api/modeles/${modele.id}/photos/ordre`, { ids: [a.id, "inconnue"] })).status, 400);
  });

  it("publie (avec photo) et gère les tags : normalisés, dédoublonnés, 12 au plus", async () => {
    const r = await pdg.patch(`/api/modeles/${modele.id}`, { publie: true, tags: [" Mariage ", "mariage", "Wax  imprimé", "Fête"] });
    assert.equal(r.status, 200);
    assert.equal(r.body.publie, true);
    assert.equal(r.body.tags.length, 3); // « Mariage » et « mariage » ne font qu'un
    assert.ok(r.body.tags.includes("Wax imprimé") && r.body.tags.includes("Fête")); // espaces normalisés
    assert.deepEqual(r.body.tags, ["Mariage", "Wax imprimé", "Fête"]); // première graphie conservée, ordre saisi
    const trop = Array.from({ length: 13 }, (_, i) => `tag${i}`);
    assert.equal((await pdg.patch(`/api/modeles/${modele.id}`, { tags: trop })).status, 400);
    assert.equal((await pdg.patch(`/api/modeles/${modele.id}`, { tags: ["x".repeat(31)] })).status, 400);
    assert.equal((await pdg.patch(`/api/modeles/${modele.id}`, { publie: "oui" })).status, 400);
  });

  it("supprimer la dernière photo dépublie le modèle ; l'image est supprimée aussi", async () => {
    const m = (await pdg.post("/api/modeles", { nom: `Solo ${marque}`, categorie: "JUPE" })).body;
    const p = (await ajouter(pdg, m.id)).body;
    await pdg.patch(`/api/modeles/${m.id}`, { publie: true });
    const avant = await prisma.imageAtelier.count({ where: { atelierId: A.id } });
    assert.equal((await pdg.delete(`/api/modeles/${m.id}/photos/${p.id}`)).status, 204);
    assert.equal((await detail(pdg, m.id)).publie, false);
    assert.equal(await prisma.imageAtelier.count({ where: { atelierId: A.id } }), avant - 1);
    assert.equal((await pdg.delete(`/api/modeles/${m.id}/photos/${p.id}`)).status, 404);
  });

  it("archiver un modèle le dépublie ; on ne peut plus lui ajouter de photo ni le publier", async () => {
    const m = (await pdg.post("/api/modeles", { nom: `Archive ${marque}`, categorie: "CHEMISE" })).body;
    await ajouter(pdg, m.id);
    await pdg.patch(`/api/modeles/${m.id}`, { publie: true });
    await pdg.post(`/api/modeles/${m.id}/archiver`);
    assert.equal((await detail(pdg, m.id)).publie, false);
    assert.equal((await ajouter(pdg, m.id)).status, 409);
    assert.equal((await pdg.patch(`/api/modeles/${m.id}`, { publie: true })).status, 409);
  });

  it("isolation : l'autre atelier ne voit, n'ajoute, ne réordonne ni ne supprime rien, et ne lit pas l'image", async () => {
    const d = await detail();
    const photo = d.photos[0];
    assert.equal((await pdgB.get(photo.url)).status, 404);
    assert.equal((await ajouter(pdgB)).status, 404);
    assert.equal((await pdgB.delete(`/api/modeles/${modele.id}/photos/${photo.id}`)).status, 404);
    assert.equal((await pdgB.put(`/api/modeles/${modele.id}/photos/ordre`, { ids: d.photos.map((p) => p.id) })).status, 404);
    assert.equal((await pdgB.get(`/api/modeles/${modele.id}`)).status, 404);
    // Une photo se retire par son modèle : un identifiant de photo d'un autre modèle de l'atelier ne passe pas.
    const autre = (await pdg.post("/api/modeles", { nom: `Autre ${marque}`, categorie: "ROBE" })).body;
    assert.equal((await pdg.delete(`/api/modeles/${autre.id}/photos/${photo.id}`)).status, 404);
    assert.equal(await prisma.photoModele.count({ where: { id: photo.id } }), 1);
  });

  it("droits : lecture (modeles.lire) consulte et voit les images ; seule l'écriture modifie ; sans compte 401", async () => {
    const photo = (await detail()).photos[0];
    assert.equal((await lecteur.get(photo.url)).status, 200);
    assert.equal((await lecteur.get(`/api/modeles/${modele.id}`)).status, 200);
    assert.equal((await ajouter(lecteur)).status, 403);
    assert.equal((await lecteur.delete(`/api/modeles/${modele.id}/photos/${photo.id}`)).status, 403);
    assert.equal((await lecteur.patch(`/api/modeles/${modele.id}`, { publie: false })).status, 403);
    assert.equal((await ajouter(redacteur)).status, 201); // modeles.ecrire (implique la lecture)
    assert.equal((await client(baseUrl).get(photo.url)).status, 401);
    assert.equal((await pdg.get("/api/images/%00")).status, 400);
  });
});
