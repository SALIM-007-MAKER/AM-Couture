// Cache HTTP (7.8) : la vitrine publique est mise en cache (durée courte + ETag, 304 sans corps), jamais les routes privées
// ni les données d'un compte. Une vitrine désactivée ne reste pas servie par un cache au-delà de la durée annoncée.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";

// node:http plutôt que fetch : fetch ajoute ses propres règles de cache aux requêtes conditionnelles et masque le 304.
const lire = (url, headers = {}) =>
  new Promise((resolve, reject) => {
    http
      .get(url, { headers }, (res) => {
        const morceaux = [];
        res.on("data", (c) => morceaux.push(c));
        res.on("end", () => resolve({ status: res.statusCode, headers: { get: (n) => res.headers[n.toLowerCase()] ?? null }, taille: Buffer.concat(morceaux).length }));
      })
      .on("error", reject);
  });

const marque = `${process.pid}-${Date.now()}`.toLowerCase();

describe("Cache HTTP des routes publiques", () => {
  let server, baseUrl, A, pdg, anonyme, slug, imageId;
  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const ra = await creerAtelierEtAdmin({ nom: "Atelier Cache" });
    A = ra.atelier;
    slug = `cache-${marque}`;
    await prisma.atelier.update({ where: { id: A.id }, data: { slug, vitrineActive: true } });
    pdg = client(baseUrl);
    anonyme = client(baseUrl);
    assert.equal((await pdg.post("/api/auth/login", { identifiant: ra.identifiant, password: ra.password })).status, 200);
    const image = await prisma.imageAtelier.create({ data: { atelierId: A.id, mime: "image/png", taille: 4, contenu: Buffer.from([1, 2, 3, 4]) } });
    imageId = image.id;
    const modele = await prisma.modele.create({ data: { atelierId: A.id, nom: "Robe cache", categorie: "ROBE", publie: true } });
    await prisma.photoModele.create({ data: { modeleId: modele.id, imageId, ordre: 0 } });
  });
  after(async () => {
    await arreterServeur(server);
    await supprimerAtelier(A.id);
    await prisma.$disconnect();
  });

  it("page de vitrine : cache public court, ETag, et 304 sans corps quand rien n'a changé", async () => {
    const r1 = await lire(`${baseUrl}/api/public/vitrines/${slug}`);
    assert.equal(r1.status, 200);
    assert.match(r1.headers.get("cache-control"), /^public, max-age=\d+/);
    const etag = r1.headers.get("etag");
    assert.ok(etag, "ETag présent");
    const r2 = await lire(`${baseUrl}/api/public/vitrines/${slug}`, { "If-None-Match": etag });
    assert.equal(r2.status, 304);
    assert.equal(r2.taille, 0);
    // Contenu modifié : l'ETag change, pas de 304.
    await prisma.modele.updateMany({ where: { atelierId: A.id }, data: { nom: "Robe cache modifiée" } });
    const r3 = await lire(`${baseUrl}/api/public/vitrines/${slug}`, { "If-None-Match": etag });
    assert.equal(r3.status, 200);
    assert.notEqual(r3.headers.get("etag"), etag);
  });

  it("image publique : cache public, ETag, 304", async () => {
    const r1 = await lire(`${baseUrl}/api/public/vitrines/${slug}/images/${imageId}`);
    assert.equal(r1.status, 200);
    assert.match(r1.headers.get("cache-control"), /^public/);
    const etag = r1.headers.get("etag");
    assert.ok(etag);
    assert.equal((await lire(`${baseUrl}/api/public/vitrines/${slug}/images/${imageId}`, { "If-None-Match": etag })).status, 304);
  });

  it("la réponse publique ne dépend pas de qui la demande (pas de cookie, pas de Set-Cookie)", async () => {
    const r = await fetch(`${baseUrl}/api/public/vitrines/${slug}`, { headers: { Cookie: pdg.cookie() } });
    assert.equal(r.headers.get("set-cookie"), null);
  });

  it("routes privées : jamais de cache public, ni pour une liste ni pour une fiche", async () => {
    for (const chemin of ["/api/clientes", "/api/modeles", "/api/commandes", "/api/auth/me", "/api/demandes"]) {
      const r = await fetch(`${baseUrl}${chemin}`, { headers: { Cookie: pdg.cookie() } });
      assert.equal(r.status, 200, chemin);
      assert.doesNotMatch(r.headers.get("cache-control") ?? "", /public/, chemin);
      assert.match(r.headers.get("cache-control") ?? "", /no-store|private/, chemin);
    }
  });

  it("vitrine désactivée : 404 immédiat, y compris pour l'image, et le 404 n'est pas mis en cache public", async () => {
    await prisma.atelier.update({ where: { id: A.id }, data: { vitrineActive: false } });
    const page = await fetch(`${baseUrl}/api/public/vitrines/${slug}`);
    assert.equal(page.status, 404);
    assert.doesNotMatch(page.headers.get("cache-control") ?? "", /public/);
    const img = await fetch(`${baseUrl}/api/public/vitrines/${slug}/images/${imageId}`);
    assert.equal(img.status, 404);
    assert.doesNotMatch(img.headers.get("cache-control") ?? "", /public/);
    void anonyme;
  });
});
