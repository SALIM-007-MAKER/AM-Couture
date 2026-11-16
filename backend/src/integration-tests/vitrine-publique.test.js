// Vitrine publique (7.2) : réglages réservés au PDG, activation explicite, liste blanche STRICTE de ce qui sort sans
// compte, aucune fuite de données privées, images limitées aux modèles publiés, isolation entre ateliers.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, creerCliente, creerCommande, supprimerAtelier } from "./helpers.js";

const MDP = "Atelier-Test-2026!";
const marque = `${process.pid}-${Date.now()}`;
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG = `data:image/png;base64,${PNG_B64}`;
const cles = (o) => Object.keys(o).sort();

describe("Vitrine publique", () => {
  let server, baseUrl, A, B, pdg, pdgB, anonyme, employe;
  let slugA, publie, brouillon, archive, autreAtelierModele;
  const photos = {};

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const ra = await creerAtelierEtAdmin({ nom: `Atelier Vitrine A ${marque}` });
    const rb = await creerAtelierEtAdmin({ nom: "Atelier Vitrine B" });
    A = ra.atelier;
    B = rb.atelier;
    slugA = `vitrine-${marque}`.toLowerCase();
    pdg = client(baseUrl);
    pdgB = client(baseUrl);
    anonyme = client(baseUrl);
    assert.equal((await pdg.post("/api/auth/login", { identifiant: ra.identifiant, password: ra.password })).status, 200);
    assert.equal((await pdgB.post("/api/auth/login", { identifiant: rb.identifiant, password: rb.password })).status, 200);
    // Un employé disposant de TOUTES les permissions délégables : les réglages de vitrine restent au PDG.
    const identifiant = `vit-emp-${marque}`;
    const { PERMISSIONS } = await import("../lib/permissions.js");
    await prisma.user.create({ data: { identifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "EMPLOYE", atelierId: A.id, prenom: "Secret", nom: "Employé", permissions: PERMISSIONS } });
    employe = client(baseUrl);
    assert.equal((await employe.post("/api/auth/login", { identifiant, password: MDP })).status, 200);

    // Données privées qui ne doivent JAMAIS apparaître sur la vitrine.
    const cliente = await creerCliente(A.id, { nom: "ClientePrivee", prenom: "Secrete", telephone: "90777771" });
    await creerCommande(A.id, cliente.id, { numero: `CMD-PRIVEE-${marque}`, prixTotal: "424242" });
    await prisma.articleStock.create({ data: { atelierId: A.id, nom: `StockPrive ${marque}`, unite: "PIECE", prixUnitaire: "313131" } });
    await prisma.fournisseur.create({ data: { atelierId: A.id, nom: `FournisseurPrive ${marque}` } });
    await prisma.depense.create({ data: { atelierId: A.id, categorie: "Loyer", montant: "575757" } });

    const creer = async (api, corps) => (await api.post("/api/modeles", corps)).body;
    publie = await creer(pdg, { nom: "Boubou Royal", categorie: "BOUBOU", description: "Brodé à la main", prixIndicatif: "98765", tags: ["mariage", "brodé"] });
    brouillon = await creer(pdg, { nom: "Brouillon Secret", categorie: "ROBE" });
    archive = await creer(pdg, { nom: "Ancien Modèle", categorie: "JUPE" });
    autreAtelierModele = await creer(pdgB, { nom: "Modèle de B", categorie: "ROBE" });
    for (const [cle, m, api] of [["publie", publie, pdg], ["brouillon", brouillon, pdg], ["archive", archive, pdg], ["autre", autreAtelierModele, pdgB]]) {
      const r = await api.post(`/api/modeles/${m.id}/photos`, { image: PNG, legende: cle === "publie" ? "Face" : undefined });
      assert.equal(r.status, 201);
      photos[cle] = r.body.imageId;
    }
    assert.equal((await pdg.patch(`/api/modeles/${publie.id}`, { publie: true })).status, 200);
    assert.equal((await pdgB.patch(`/api/modeles/${autreAtelierModele.id}`, { publie: true })).status, 200);
    // Cas piège : modèle archivé resté « publié » par une écriture directe en base — il ne doit JAMAIS sortir.
    await prisma.modele.update({ where: { id: archive.id }, data: { publie: true, archivedAt: new Date() } });
    await prisma.atelier.update({ where: { id: A.id }, data: { logoUrl: PNG, telephone: "+221 77 555 00 00", adresse: "12 rue du Marché", ville: "Dakar", pays: "Sénégal", slogan: "Élégance sur mesure" } });
  });

  after(async () => {
    await arreterServeur(server);
    for (const a of [A, B]) {
      await prisma.journalSecurite.deleteMany({ where: { atelierId: a.id } });
      await supprimerAtelier(a.id);
    }
    await prisma.$disconnect();
  });

  describe("réglages (PDG seulement)", () => {
    it("par défaut : désactivée, sans identifiant, avec le nombre de modèles publiés", async () => {
      const r = await pdg.get("/api/vitrine");
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, { slug: null, vitrineActive: false, vitrineDescription: null, couleurPrincipale: null, vitrineContact: false, demandesEnLigne: false, modelesPublies: 1 });
    });

    it("réservés au PDG : un employé même tout-puissant et un visiteur sont refusés", async () => {
      assert.equal((await employe.get("/api/vitrine")).status, 403);
      assert.equal((await employe.patch("/api/vitrine", { vitrineActive: true })).status, 403);
      assert.equal((await anonyme.get("/api/vitrine")).status, 401);
    });

    it("valide l'identifiant (format, réservés, longueur), la couleur (format et contraste), les champs inconnus", async () => {
      const mauvais = [
        { slug: "ab" }, { slug: "Mon Atelier" }, { slug: "-debut" }, { slug: "fin-" }, { slug: "a--b" }, { slug: "admin" }, { slug: "x".repeat(41) },
        { couleurPrincipale: "rouge" }, { couleurPrincipale: "#fff" }, { couleurPrincipale: "#ffd700" }, // jaune : texte blanc illisible
        { vitrineActive: true }, // pas d'identifiant
        { vitrineActive: "oui" }, { nom: "Piratage" }, { atelierId: B.id }, {},
      ];
      for (const corps of mauvais) assert.equal((await pdg.patch("/api/vitrine", corps)).status, 400, JSON.stringify(corps));
      assert.deepEqual((await pdg.get("/api/vitrine")).body.slug, null);
    });

    it("enregistre : identifiant normalisé en minuscules, couleur, description, effacement par null", async () => {
      const r = await pdg.patch("/api/vitrine", { slug: slugA.toUpperCase(), couleurPrincipale: "#800020", vitrineDescription: "  Atelier de couture traditionnelle ", vitrineContact: true });
      assert.equal(r.status, 200);
      assert.equal(r.body.slug, slugA);
      assert.equal(r.body.couleurPrincipale, "#800020");
      assert.equal(r.body.vitrineActive, false);
      assert.equal((await pdg.patch("/api/vitrine", { couleurPrincipale: null })).body.couleurPrincipale, null);
      await pdg.patch("/api/vitrine", { couleurPrincipale: "#800020" });
    });

    it("l'identifiant est unique sur la plateforme (409), comparé sans casse", async () => {
      assert.equal((await pdgB.patch("/api/vitrine", { slug: slugA })).status, 409);
      assert.equal((await pdgB.patch("/api/vitrine", { slug: slugA.toUpperCase() })).status, 409);
      assert.equal((await pdg.patch("/api/vitrine", { slug: slugA })).status, 200); // le sien, inchangé
    });
  });

  describe("accès public", () => {
    it("vitrine désactivée ou inconnue : le même 404, aucune différence observable", async () => {
      const desactivee = await anonyme.get(`/api/public/vitrines/${slugA}`);
      const inconnue = await anonyme.get("/api/public/vitrines/n-existe-pas");
      assert.equal(desactivee.status, 404);
      assert.deepEqual(desactivee.body, inconnue.body);
      assert.equal((await anonyme.get(`/api/public/vitrines/${slugA}/logo`)).status, 404);
      assert.equal((await anonyme.get(`/api/public/vitrines/${slugA}/images/${photos.publie}`)).status, 404);
      assert.equal((await anonyme.get("/api/public/vitrines/%00")).status, 404);
    });

    it("activée : sans compte, ne montre que les modèles publiés et non archivés", async () => {
      assert.equal((await pdg.patch("/api/vitrine", { vitrineActive: true })).status, 200);
      const r = await anonyme.get(`/api/public/vitrines/${slugA}`);
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.modeles.map((m) => m.nom), ["Boubou Royal"]);
      assert.equal(r.body.meta.total, 1);
      assert.match(r.headers.get("cache-control"), /^public/);
    });

    it("LISTE BLANCHE : l'ensemble exact des clés exposées", async () => {
      const r = (await anonyme.get(`/api/public/vitrines/${slugA}`)).body;
      assert.deepEqual(cles(r), ["atelier", "meta", "modeles"]);
      assert.deepEqual(cles(r.atelier), ["contact", "couleur", "demandes", "description", "logo", "nom", "slogan"]);
      assert.deepEqual(cles(r.atelier.contact), ["adresse", "pays", "telephone", "ville"]);
      assert.deepEqual(cles(r.modeles[0]), ["categorie", "description", "id", "nom", "photos", "tags"]);
      assert.deepEqual(cles(r.modeles[0].photos[0]), ["legende", "url"]);
      assert.deepEqual(cles(r.meta), ["page", "pageSize", "total", "totalPages"]);
      assert.equal(r.atelier.nom, `Atelier Vitrine A ${marque}`);
      assert.equal(r.atelier.contact.telephone, "+221 77 555 00 00");
      assert.deepEqual(r.modeles[0].tags, ["mariage", "brodé"]);
      assert.equal(r.modeles[0].photos[0].legende, "Face");
    });

    it("AUCUNE donnée privée n'apparaît : ni client, commande, prix, stock, fournisseur, dépense, identifiants", async () => {
      const corps = JSON.stringify((await anonyme.get(`/api/public/vitrines/${slugA}`)).body);
      const interdits = ["ClientePrivee", "Secrete", "90777771", "CMD-PRIVEE", "424242", "98765", "313131", "575757", "StockPrive", "FournisseurPrive", "Brouillon Secret", "Ancien Modèle", A.id, B.id, "Secret", "prixIndicatif", "prixTotal", "atelierId", "passwordHash", "permissions"];
      for (const mot of interdits) assert.ok(!corps.includes(mot), `fuite : « ${mot} »`);
      // Les identifiants de modèles publiés sont volontairement publics (pour demander ce modèle) ; jamais ceux des autres.
      assert.ok(!corps.includes(brouillon.id) && !corps.includes(archive.id) && !corps.includes(autreAtelierModele.id));
    });

    it("coordonnées masquées tant que le PDG ne les a pas choisies", async () => {
      await pdg.patch("/api/vitrine", { vitrineContact: false });
      const r = (await anonyme.get(`/api/public/vitrines/${slugA}`)).body;
      assert.equal(r.atelier.contact, null);
      const corps = JSON.stringify(r);
      for (const mot of ["77 555", "Marché", "Dakar", "Sénégal"]) assert.ok(!corps.includes(mot), mot);
      await pdg.patch("/api/vitrine", { vitrineContact: true });
    });

    it("filtres : catégorie, tag, recherche ; valeurs invalides refusées ; taille de page bornée", async () => {
      const base = `/api/public/vitrines/${slugA}`;
      assert.equal((await anonyme.get(`${base}?categorie=BOUBOU`)).body.modeles.length, 1);
      assert.equal((await anonyme.get(`${base}?categorie=ROBE`)).body.modeles.length, 0); // le brouillon n'est pas publié
      assert.equal((await anonyme.get(`${base}?tag=mariage`)).body.modeles.length, 1);
      assert.equal((await anonyme.get(`${base}?tag=inconnu`)).body.modeles.length, 0);
      assert.equal((await anonyme.get(`${base}?q=royal`)).body.modeles.length, 1);
      assert.equal((await anonyme.get(`${base}?categorie=PIRATE`)).status, 400);
      assert.equal((await anonyme.get(`${base}?pageSize=51`)).status, 400);
      assert.equal((await anonyme.get(`${base}?page=0`)).status, 400);
    });
  });

  describe("images", () => {
    it("une photo publiée se sert sans compte, avec ses octets exacts et le bon type", async () => {
      const res = await fetch(`${baseUrl}/api/public/vitrines/${slugA}/images/${photos.publie}`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "image/png");
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      assert.deepEqual(Buffer.from(await res.arrayBuffer()), Buffer.from(PNG_B64, "base64"));
    });

    it("le logo est servi comme une image ; sans logo, 404", async () => {
      const res = await fetch(`${baseUrl}/api/public/vitrines/${slugA}/logo`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "image/png");
      const corps = (await anonyme.get(`/api/public/vitrines/${slugA}`)).body;
      assert.equal(corps.atelier.logo, `/api/public/vitrines/${slugA}/logo`);
    });

    it("jamais la photo d'un brouillon, d'un archivé, ni d'un autre atelier ; les images privées restent privées", async () => {
      for (const cle of ["brouillon", "archive", "autre"]) {
        assert.equal((await anonyme.get(`/api/public/vitrines/${slugA}/images/${photos[cle]}`)).status, 404, cle);
      }
      assert.equal((await anonyme.get("/api/public/vitrines/n-existe-pas/images/" + photos.publie)).status, 404);
      assert.equal((await anonyme.get(`/api/images/${photos.publie}`)).status, 401); // l'URL privée n'est pas ouverte
    });

    it("dépublier ou désactiver coupe l'accès immédiatement", async () => {
      await pdg.patch(`/api/modeles/${publie.id}`, { publie: false });
      assert.equal((await anonyme.get(`/api/public/vitrines/${slugA}/images/${photos.publie}`)).status, 404);
      assert.equal((await anonyme.get(`/api/public/vitrines/${slugA}`)).body.modeles.length, 0);
      await pdg.patch(`/api/modeles/${publie.id}`, { publie: true });
      assert.equal((await anonyme.get(`/api/public/vitrines/${slugA}/images/${photos.publie}`)).status, 200);
      await pdg.patch("/api/vitrine", { vitrineActive: false });
      assert.equal((await anonyme.get(`/api/public/vitrines/${slugA}`)).status, 404);
      assert.equal((await anonyme.get(`/api/public/vitrines/${slugA}/images/${photos.publie}`)).status, 404);
      await pdg.patch("/api/vitrine", { vitrineActive: true });
    });

    it("un atelier suspendu par la plateforme disparaît de la vitrine", async () => {
      await prisma.atelier.update({ where: { id: A.id }, data: { actif: false } });
      assert.equal((await anonyme.get(`/api/public/vitrines/${slugA}`)).status, 404);
      await prisma.atelier.update({ where: { id: A.id }, data: { actif: true } });
      assert.equal((await anonyme.get(`/api/public/vitrines/${slugA}`)).status, 200);
    });
  });

  describe("isolation", () => {
    it("la vitrine de B ne montre que B, même avec l'identifiant de A dans l'adresse d'une image", async () => {
      await pdgB.patch("/api/vitrine", { slug: `vitrine-b-${marque}`.toLowerCase(), vitrineActive: true });
      const r = (await anonyme.get(`/api/public/vitrines/vitrine-b-${marque}`.toLowerCase())).body;
      assert.deepEqual(r.modeles.map((m) => m.nom), ["Modèle de B"]);
      assert.equal((await anonyme.get(`/api/public/vitrines/vitrine-b-${marque}/images/${photos.publie}`.toLowerCase())).status, 404);
      assert.equal((await anonyme.get(`/api/public/vitrines/${slugA}/images/${photos.autre}`)).status, 404);
    });
  });

  describe("abus", () => {
    it("au-delà de 120 requêtes par minute et par IP : 429", async () => {
      const gros = client(baseUrl);
      let refuse = 0;
      for (let i = 0; i < 125; i++) if ((await gros.get(`/api/public/vitrines/${slugA}`)).status === 429) refuse += 1;
      assert.ok(refuse >= 1, "le limiteur doit refuser au moins une requête");
    });
  });
});
