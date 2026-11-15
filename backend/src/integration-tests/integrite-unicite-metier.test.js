// Sous-phase 3.3 — unicité MÉTIER sans contrainte en base : téléphone d'une cliente (par atelier),
// nom d'un modèle (par atelier et catégorie, insensible à la casse). Anomalies 5 et 6 : la vérification
// applicative seule laissait passer des doublons sous concurrence (mesuré : 2 clientes sur 8 requêtes,
// 6 modèles sur 8). Garantie par un verrou consultatif transactionnel sur la clé métier.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur } from "./helpers.js";
import { enParallele, repartition } from "./invariants.js";
import { preparerAtelier, nettoyerAtelier } from "./concurrence-helpers.js";

describe("Intégrité — unicité métier sous concurrence (clientes et modèles)", () => {
  let server, baseUrl, A, B;
  const base = () => `77${String(process.pid).slice(-3)}${String(Date.now()).slice(-5)}`;
  let compteur = 0;
  const telephone = () => `${base()}${compteur++ % 10}`;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    A = await preparerAtelier(baseUrl, "Atelier Unicité Métier A");
    B = await preparerAtelier(baseUrl, "Atelier Unicité Métier B");
  });

  after(async () => {
    await arreterServeur(server);
    for (const ctx of [A, B]) await nettoyerAtelier(ctx.atelier.id, [ctx.admin.id]);
    await prisma.$disconnect();
  });

  const creerCliente = (ctx, tel, nom = "Diallo") => ctx.api.post("/api/clientes", { nom, prenom: "Awa", telephone: tel });
  const compterClientes = (ctx, tel) => prisma.cliente.count({ where: { atelierId: ctx.atelier.id, telephone: tel } });

  // ───────────── Clientes (anomalie 5)
  it("8 créations simultanées de cliente avec le même téléphone : 1 succès, 7 refus 409, une seule cliente en base", async () => {
    const tel = telephone();
    const reponses = await enParallele(8, () => creerCliente(A, tel));
    assert.deepEqual(repartition(reponses), { 201: 1, 409: 7 }, JSON.stringify(repartition(reponses)));
    assert.equal(await compterClientes(A, tel), 1);
    for (const r of reponses.filter((x) => x.status === 409)) {
      assert.equal(r.body.error, "Un client existe déjà avec ce numéro de téléphone.");
      assert.ok(r.body.details?.clienteId, "le refus désigne la cliente existante");
    }
  });

  it("le même numéro écrit avec des espaces ou des tirets est reconnu comme un doublon, même simultané", async () => {
    // La normalisation (lib/phone.js) supprime espaces et tirets mais CONSERVE le « + » : `+227…` et
    // `227…` sont deux numéros distincts pour l'application (règle existante, hors périmètre ici).
    const tel = telephone();
    const variantes = [tel, `${tel.slice(0, 2)} ${tel.slice(2, 5)} ${tel.slice(5)}`, ` ${tel} `, `${tel.slice(0, 3)}-${tel.slice(3)}`];
    const reponses = await enParallele(8, (i) => creerCliente(A, variantes[i % variantes.length]));
    assert.equal(reponses.filter((r) => r.status === 201).length, 1, JSON.stringify(reponses.map((r) => [r.status, r.body?.error])));
    for (const r of reponses) assert.ok([201, 409].includes(r.status), `statut inattendu ${r.status}`);
    assert.equal(await compterClientes(A, tel), 1);
  });
  it("deux ateliers créent la même cliente (même téléphone) en même temps : les deux réussissent (verrou par atelier)", async () => {
    const tel = telephone();
    const [a, b] = await Promise.all([creerCliente(A, tel), creerCliente(B, tel)]);
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
  });

  it("modification simultanée de deux clientes vers le même téléphone : une seule réussit", async () => {
    const c1 = (await creerCliente(A, telephone())).body;
    const c2 = (await creerCliente(A, telephone())).body;
    const cible = telephone();
    const reponses = await Promise.all([
      A.api.patch(`/api/clientes/${c1.id}`, { telephone: cible }),
      A.api.patch(`/api/clientes/${c2.id}`, { telephone: cible }),
    ]);
    assert.deepEqual(repartition(reponses), { 200: 1, 409: 1 }, JSON.stringify(repartition(reponses)));
    assert.equal(await compterClientes(A, cible), 1);
  });

  it("création et modification simultanées visant le même téléphone : jamais deux clientes avec ce numéro", async () => {
    const existante = (await creerCliente(A, telephone())).body;
    const cible = telephone();
    const reponses = await Promise.all([creerCliente(A, cible, "Nouvelle"), A.api.patch(`/api/clientes/${existante.id}`, { telephone: cible })]);
    assert.equal(reponses.filter((r) => r.status === 200 || r.status === 201).length, 1, JSON.stringify(reponses.map((r) => r.status)));
    assert.equal(await compterClientes(A, cible), 1);
  });

  it("[contrôle] doublon séquentiel : message et détails inchangés ; modification sans changer le numéro acceptée", async () => {
    const tel = telephone();
    const c = (await creerCliente(A, tel)).body;
    const dup = await creerCliente(A, tel);
    assert.equal(dup.status, 409);
    assert.equal(dup.body.details.clienteId, c.id);
    assert.equal((await A.api.patch(`/api/clientes/${c.id}`, { telephone: tel, nom: "Nouveau nom" })).status, 200);
  });

  // ───────────── Modèles (anomalie 6)
  const creerModele = (ctx, nom, categorie = "BOUBOU") => ctx.api.post("/api/modeles", { nom, categorie });
  const compterModeles = (ctx, nom) => prisma.modele.count({ where: { atelierId: ctx.atelier.id, nom: { equals: nom, mode: "insensitive" } } });

  it("8 créations simultanées de modèle avec le même nom et la même catégorie : 1 succès, 7 refus 409", async () => {
    const nom = `Boubou Royal ${process.pid}-${Date.now()}`;
    const reponses = await enParallele(8, () => creerModele(A, nom));
    assert.deepEqual(repartition(reponses), { 201: 1, 409: 7 }, JSON.stringify(repartition(reponses)));
    assert.equal(await compterModeles(A, nom), 1);
    for (const r of reponses.filter((x) => x.status === 409)) assert.equal(r.body.error, "Un modèle avec ce nom existe déjà dans cette catégorie.");
  });

  it("le nom écrit avec une autre casse ou des espaces en plus est un doublon, même simultané", async () => {
    const racine = `Kaftan Soir ${process.pid}-${Date.now()}`;
    const variantes = [racine, racine.toLowerCase(), racine.toUpperCase(), `  ${racine}  `];
    const reponses = await enParallele(8, (i) => creerModele(A, variantes[i % variantes.length], "KAFTAN"));
    assert.equal(reponses.filter((r) => r.status === 201).length, 1, JSON.stringify(reponses.map((r) => [r.status, r.body?.error])));
    assert.equal(await compterModeles(A, racine), 1);
  });

  it("même nom dans deux catégories différentes, ou dans deux ateliers : autorisé même simultané", async () => {
    const nom = `Ensemble Fête ${process.pid}-${Date.now()}`;
    const reponses = await Promise.all([creerModele(A, nom, "ROBE"), creerModele(A, nom, "JUPE"), creerModele(B, nom, "ROBE")]);
    assert.deepEqual(repartition(reponses), { 201: 3 });
  });

  it("renommage simultané de deux modèles vers le même nom : un seul réussit", async () => {
    const n = `${process.pid}-${Date.now()}`;
    const m1 = (await creerModele(A, `Modèle un ${n}`, "COSTUME")).body;
    const m2 = (await creerModele(A, `Modèle deux ${n}`, "COSTUME")).body;
    const cible = `Modèle cible ${n}`;
    const reponses = await Promise.all([A.api.patch(`/api/modeles/${m1.id}`, { nom: cible }), A.api.patch(`/api/modeles/${m2.id}`, { nom: cible })]);
    assert.deepEqual(repartition(reponses), { 200: 1, 409: 1 }, JSON.stringify(repartition(reponses)));
    assert.equal(await compterModeles(A, cible), 1);
  });

  it("[contrôle] doublon séquentiel de modèle : message et détails inchangés", async () => {
    const nom = `Pantalon Lin ${process.pid}-${Date.now()}`;
    const m = (await creerModele(A, nom, "PANTALON")).body;
    const dup = await creerModele(A, nom, "PANTALON");
    assert.equal(dup.status, 409);
    assert.equal(dup.body.details.modeleId, m.id);
  });
});
