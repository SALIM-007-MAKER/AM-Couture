// Sous-phase 3.3 — idempotence (docs/IDEMPOTENCE.md). En-tête optionnel `Idempotency-Key` :
//  - même clé + même requête  → la réponse 2xx d'origine est REJOUÉE, rien n'est ré-exécuté ;
//  - même clé + requête différente → 422 ;
//  - même clé pendant le traitement → 409 « en cours » + Retry-After ;
//  - seules les réponses 2xx sont mémorisées (un 4xx ou 5xx se réévalue au réessai) ;
//  - clé scopée par atelier ; durée de vie 24 h ; sans en-tête, comportement inchangé.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client } from "./helpers.js";
import { toutesViolations, enParallele, repartition } from "./invariants.js";
import { MDP, preparerAtelier, creerCommandeApi, payer, nettoyerAtelier } from "./concurrence-helpers.js";

const cleUnique = (p = "k") => `${p}-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
const H = (cle) => ({ "Idempotency-Key": cle });

describe("Idempotence — en-tête Idempotency-Key", () => {
  let server, baseUrl, A, B, superadmin, S;
  const portees = [];

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    A = await preparerAtelier(baseUrl, "Atelier Idempotence A");
    B = await preparerAtelier(baseUrl, "Atelier Idempotence B");
    portees.push(`atelier:${A.atelier.id}`, `atelier:${B.atelier.id}`);
    const idSuper = cleUnique("super-idem");
    superadmin = await prisma.user.create({ data: { identifiant: idSuper, passwordHash: await bcrypt.hash(MDP, 4), role: "SUPERADMIN" } });
    portees.push(`superadmin:${superadmin.id}`);
    S = client(baseUrl);
    assert.equal((await S.post("/api/auth/login", { identifiant: idSuper, password: MDP })).status, 200);
  });

  after(async () => {
    await arreterServeur(server);
    await prisma.cleIdempotence?.deleteMany({ where: { portee: { in: portees } } }).catch(() => {});
    await prisma.historiqueAbonnement.deleteMany({ where: { atelierId: { in: [A.atelier.id, B.atelier.id] } } });
    await prisma.abonnement.deleteMany({ where: { atelierId: { in: [A.atelier.id, B.atelier.id] } } });
    await prisma.planAbonnement.deleteMany({ where: { nom: { startsWith: `Plan Idem ${process.pid}` } } });
    await prisma.journalSecurite.deleteMany({ where: { userId: superadmin.id } });
    await prisma.user.delete({ where: { id: superadmin.id } });
    for (const ctx of [A, B]) await nettoyerAtelier(ctx.atelier.id, [ctx.admin.id]);
    await prisma.$disconnect();
  });

  const paiements = (commandeId) => prisma.paiement.count({ where: { commandeId } });
  const post = (ctx, commandeId, montant, cle) =>
    ctx.api.post(`/api/commandes/${commandeId}/paiements`, { montant: String(montant), mode: "ESPECES" }, cle ? H(cle) : undefined);

  // ───────────── Contrat sur les paiements
  it("même clé, même requête (séquentiel) : la réponse d'origine est rejouée, un seul paiement enregistré", async () => {
    const c = await creerCommandeApi(A.api, A.cliente.id);
    const cle = cleUnique();
    const r1 = await post(A, c.id, 3000, cle);
    const r2 = await post(A, c.id, 3000, cle);
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    assert.deepEqual(r2.body, r1.body, "la réponse rejouée doit être identique à l'originale");
    assert.equal(r2.headers.get("idempotent-replay"), "true");
    assert.equal(r1.headers.get("idempotent-replay"), null);
    assert.equal(await paiements(c.id), 1);
  });

  it("8 requêtes SIMULTANÉES avec la même clé : une seule exécution, les autres rejouent ou reçoivent 409 « en cours »", async () => {
    const c = await creerCommandeApi(A.api, A.cliente.id);
    const cle = cleUnique();
    const reponses = await enParallele(8, () => post(A, c.id, 2500, cle));
    for (const r of reponses) assert.ok([201, 409].includes(r.status), `statut inattendu ${r.status} ${JSON.stringify(r.body)}`);
    const succes = reponses.filter((r) => r.status === 201);
    assert.ok(succes.length >= 1);
    assert.equal(new Set(succes.map((r) => r.body.id)).size, 1, "tous les succès désignent le MÊME paiement");
    for (const r of reponses.filter((x) => x.status === 409)) {
      assert.equal(r.headers.get("retry-after"), "1");
      assert.match(r.body.error, /en cours/i);
    }
    assert.equal(await paiements(c.id), 1, "le paiement ne doit être enregistré qu'une fois");
    assert.deepEqual(await toutesViolations(A.atelier.id), []);
  });

  it("sans en-tête : comportement inchangé (une requête répétée crée deux paiements)", async () => {
    const c = await creerCommandeApi(A.api, A.cliente.id);
    assert.equal((await post(A, c.id, 1000)).status, 201);
    assert.equal((await post(A, c.id, 1000)).status, 201);
    assert.equal(await paiements(c.id), 2);
  });

  it("même clé, corps différent : 422, aucun second paiement", async () => {
    const c = await creerCommandeApi(A.api, A.cliente.id);
    const cle = cleUnique();
    assert.equal((await post(A, c.id, 1000, cle)).status, 201);
    const r = await post(A, c.id, 2000, cle);
    assert.equal(r.status, 422);
    assert.match(r.body.error, /requête différente/i);
    assert.equal(await paiements(c.id), 1);
  });

  it("même clé sur une AUTRE commande : 422", async () => {
    const c1 = await creerCommandeApi(A.api, A.cliente.id);
    const c2 = await creerCommandeApi(A.api, A.cliente.id);
    const cle = cleUnique();
    assert.equal((await post(A, c1.id, 1000, cle)).status, 201);
    assert.equal((await post(A, c2.id, 1000, cle)).status, 422);
    assert.equal(await paiements(c2.id), 0);
  });

  it("isolation : la même clé utilisée par deux ateliers est indépendante", async () => {
    const cA = await creerCommandeApi(A.api, A.cliente.id);
    const cB = await creerCommandeApi(B.api, B.cliente.id);
    const cle = cleUnique("partagee");
    const [a, b] = await Promise.all([post(A, cA.id, 1000, cle), post(B, cB.id, 1000, cle)]);
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal(b.headers.get("idempotent-replay"), null, "la réponse de B ne doit jamais venir de la mémoire de A");
    assert.equal(await paiements(cA.id), 1);
    assert.equal(await paiements(cB.id), 1);
  });

  it("un refus 409 n'est PAS mémorisé : le même appel est réévalué (et réussit une fois le solde libéré)", async () => {
    const c = await creerCommandeApi(A.api, A.cliente.id, { prixTotal: "10000" });
    const p0 = (await post(A, c.id, 8000)).body;
    const cle = cleUnique();
    const refuse = await post(A, c.id, 5000, cle);
    assert.equal(refuse.status, 409);
    assert.equal((await A.api.post(`/api/commandes/${c.id}/paiements/${p0.id}/annuler`, { motif: "Erreur de saisie" })).status, 200);
    const reessai = await post(A, c.id, 5000, cle);
    assert.equal(reessai.status, 201, "le refus d'origine ne doit pas être rejoué");
    assert.equal(reessai.headers.get("idempotent-replay"), null);
  });

  it("une erreur 5xx n'est PAS mémorisée : le réessai avec la même clé s'exécute une fois la panne résolue", async () => {
    const c = await creerCommandeApi(A.api, A.cliente.id);
    const fonction = `am_test_idem_fn_${process.pid}`;
    const declencheur = `am_test_idem_trg_${process.pid}`;
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION ${fonction}() RETURNS trigger AS $$ BEGIN IF NEW."clienteId" = TG_ARGV[0] THEN RAISE EXCEPTION 'panne simulee'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${declencheur} BEFORE INSERT ON "NotificationClient" FOR EACH ROW EXECUTE FUNCTION ${fonction}('${A.cliente.id}')`);
    const cle = cleUnique();
    try {
      const panne = await post(A, c.id, 1000, cle);
      assert.ok(panne.status >= 500, `statut ${panne.status}`);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${declencheur} ON "NotificationClient"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fonction}()`);
    }
    const reessai = await post(A, c.id, 1000, cle);
    assert.equal(reessai.status, 201);
    assert.equal(await paiements(c.id), 1);
  });

  it("clé expirée (24 h) : traitée comme une nouvelle requête", async () => {
    const c = await creerCommandeApi(A.api, A.cliente.id);
    const cle = cleUnique();
    const r1 = await post(A, c.id, 1000, cle);
    await prisma.cleIdempotence.updateMany({ where: { portee: `atelier:${A.atelier.id}`, cle }, data: { expireLe: new Date(Date.now() - 1000) } });
    const r2 = await post(A, c.id, 1000, cle);
    assert.equal(r2.status, 201);
    assert.notEqual(r2.body.id, r1.body.id);
    assert.equal(await paiements(c.id), 2);
  });

  it("traitement en cours depuis moins de 60 s : 409 ; abandonné depuis plus de 60 s : repris et exécuté", async () => {
    const { calculerEmpreinte } = await import("../lib/idempotence.js");
    const c = await creerCommandeApi(A.api, A.cliente.id);
    const chemin = `/api/commandes/${c.id}/paiements`;
    const corps = { montant: "1500", mode: "ESPECES" };
    const empreinte = calculerEmpreinte("POST", chemin, corps);
    const recente = cleUnique("recente");
    await prisma.cleIdempotence.create({ data: { portee: `atelier:${A.atelier.id}`, cle: recente, methode: "POST", chemin, empreinte, statut: "EN_COURS", expireLe: new Date(Date.now() + 86_400_000) } });
    const attente = await A.api.post(chemin, corps, H(recente));
    assert.equal(attente.status, 409);
    assert.equal(await paiements(c.id), 0);

    const abandonnee = cleUnique("abandonnee");
    await prisma.cleIdempotence.create({ data: { portee: `atelier:${A.atelier.id}`, cle: abandonnee, methode: "POST", chemin, empreinte, statut: "EN_COURS", createdAt: new Date(Date.now() - 120_000), expireLe: new Date(Date.now() + 86_400_000) } });
    const reprise = await A.api.post(chemin, corps, H(abandonnee));
    assert.equal(reprise.status, 201, JSON.stringify(reprise.body));
    assert.equal(await paiements(c.id), 1);
  });

  it("clé mal formée : 400 explicite, rien n'est exécuté", async () => {
    const c = await creerCommandeApi(A.api, A.cliente.id);
    for (const mauvaise of ["court", "a".repeat(200), "contient des espaces", "accentué-é-é-é-é"]) {
      const r = await post(A, c.id, 1000, mauvaise);
      assert.equal(r.status, 400, `clé ${JSON.stringify(mauvaise).slice(0, 30)} : statut ${r.status}`);
      assert.match(r.body.error, /Idempotency-Key/);
    }
    assert.equal(await paiements(c.id), 0);
  });

  // ───────────── Autres opérations protégées
  it("commande : même clé → une seule commande, même numéro rejoué", async () => {
    const corps = { clienteId: A.cliente.id, typeVetement: "ROBE", prixTotal: "9000", dateLivraisonPrevue: new Date(Date.now() + 5 * 864e5).toISOString() };
    const cle = cleUnique();
    const avant = await prisma.commande.count({ where: { atelierId: A.atelier.id } });
    const r1 = await A.api.post("/api/commandes", corps, H(cle));
    const r2 = await A.api.post("/api/commandes", corps, H(cle));
    assert.equal(r1.status, 201);
    assert.equal(r2.body.numero, r1.body.numero);
    assert.equal(await prisma.commande.count({ where: { atelierId: A.atelier.id } }), avant + 1);
  });

  it("commande : 8 requêtes simultanées avec la même clé → une seule commande créée", async () => {
    const corps = { clienteId: A.cliente.id, typeVetement: "BOUBOU", prixTotal: "7000", dateLivraisonPrevue: new Date(Date.now() + 5 * 864e5).toISOString() };
    const cle = cleUnique();
    const avant = await prisma.commande.count({ where: { atelierId: A.atelier.id } });
    const reponses = await enParallele(8, () => A.api.post("/api/commandes", corps, H(cle)));
    for (const r of reponses) assert.ok([201, 409].includes(r.status));
    assert.equal(await prisma.commande.count({ where: { atelierId: A.atelier.id } }), avant + 1);
    assert.deepEqual(await toutesViolations(A.atelier.id), []);
  });

  it("livraison avec paiement final : même clé → une seule livraison et un seul paiement final", async () => {
    const c = await creerCommandeApi(A.api, A.cliente.id, { statut: "TERMINEE", prixTotal: "10000" });
    await payer(A.api, c.id, 4000);
    const corps = { paiementFinal: { montant: "6000", mode: "ESPECES" } };
    const cle = cleUnique();
    const r1 = await A.api.post(`/api/commandes/${c.id}/livraisons`, corps, H(cle));
    const r2 = await A.api.post(`/api/commandes/${c.id}/livraisons`, corps, H(cle));
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    assert.equal(r2.headers.get("idempotent-replay"), "true");
    assert.equal(await paiements(c.id), 2);
    assert.equal(await prisma.livraison.count({ where: { commandeId: c.id } }), 1);
  });

  it("mouvement de stock, dépense, cliente : même clé → une seule écriture", async () => {
    const article = (await A.api.post("/api/stock", { nom: `Tissu idem ${cleUnique()}`, unite: "METRE", quantiteInitiale: "10" })).body;
    const k1 = cleUnique();
    const mv = { type: "SORTIE", quantite: "2", motif: "test" };
    await A.api.post(`/api/stock/${article.id}/mouvements`, mv, H(k1));
    await A.api.post(`/api/stock/${article.id}/mouvements`, mv, H(k1));
    assert.equal(await prisma.mouvementStock.count({ where: { articleId: article.id, type: "SORTIE" } }), 1);

    const k2 = cleUnique();
    const dep = { categorie: "TISSU", montant: "1234", description: `idem ${k2}` };
    await A.api.post("/api/depenses", dep, H(k2));
    await A.api.post("/api/depenses", dep, H(k2));
    assert.equal(await prisma.depense.count({ where: { atelierId: A.atelier.id, description: `idem ${k2}` } }), 1);

    const k3 = cleUnique();
    const tel = `77${String(Date.now()).slice(-7)}`;
    const cl = { nom: "Idem", prenom: "Cliente", telephone: tel };
    const c1 = await A.api.post("/api/clientes", cl, H(k3));
    const c2 = await A.api.post("/api/clientes", cl, H(k3));
    assert.equal(c1.status, 201);
    assert.equal(c2.status, 201, "rejouée, pas refusée comme doublon de téléphone");
    assert.equal(c2.body.id, c1.body.id);
    assert.equal(await prisma.cliente.count({ where: { atelierId: A.atelier.id, telephone: tel } }), 1);
  });

  it("activation d'abonnement (SuperAdmin) : 5 requêtes simultanées avec la même clé → UN seul abonnement (sans clé : 5, mesuré)", async () => {
    const plan = await prisma.planAbonnement.create({ data: { nom: `Plan Idem ${process.pid}`, prixMensuel: 15000, fonctionnalites: ["x"], actif: true } });
    const cle = cleUnique();
    const avant = await prisma.abonnement.count({ where: { atelierId: A.atelier.id } });
    const reponses = await enParallele(5, () => S.post(`/api/ateliers/${A.atelier.id}/abonnement/activer`, { mode: "CATALOGUE", planId: plan.id, periodicite: "MENSUEL" }, H(cle)));
    for (const r of reponses) assert.ok([201, 409].includes(r.status), `statut ${r.status}`);
    assert.equal(await prisma.abonnement.count({ where: { atelierId: A.atelier.id } }), avant + 1);
    const sansCle = await enParallele(3, () => S.post(`/api/ateliers/${B.atelier.id}/abonnement/activer`, { mode: "CATALOGUE", planId: plan.id, periodicite: "MENSUEL" }));
    assert.deepEqual(repartition(sansCle), { 201: 3 }, "sans clé le comportement reste inchangé (non protégé)");
  });

  // ───────────── Purge
  it("purge : supprime les clés expirées, conserve les autres", async () => {
    const { purgerClesIdempotence } = await import("../lib/idempotence.js");
    const portee = `atelier:${A.atelier.id}`;
    const vieille = cleUnique("vieille");
    const fraiche = cleUnique("fraiche");
    const base = { portee, methode: "POST", chemin: "/x", empreinte: "e", statut: "TERMINEE", reponseStatut: 201, reponseCorps: {} };
    await prisma.cleIdempotence.create({ data: { ...base, cle: vieille, expireLe: new Date(Date.now() - 3_600_000) } });
    await prisma.cleIdempotence.create({ data: { ...base, cle: fraiche, expireLe: new Date(Date.now() + 3_600_000) } });
    const n = await purgerClesIdempotence();
    assert.ok(n >= 1);
    assert.equal(await prisma.cleIdempotence.findUnique({ where: { portee_cle: { portee, cle: vieille } } }), null);
    assert.ok(await prisma.cleIdempotence.findUnique({ where: { portee_cle: { portee, cle: fraiche } } }));
  });
});
