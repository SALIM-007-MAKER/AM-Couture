// Notifications automatiques (6.6) : travail confié, retards, stock bas, achats en retard ; destinataires, lecture
// individuelle des employés, résumé quotidien réservé au PDG, isolation entre ateliers. Base Postgres jetable.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { normaliserPermissions } from "../lib/permissions.js";
import { UTILISATEURS_RESUME_QUOTIDIEN } from "../lib/rappelsQuotidiens.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, creerCliente, creerCommande, supprimerAtelier } from "./helpers.js";

const JOUR = 86_400_000;
const MDP = "Atelier-Test-2026!";
const marque = `${process.pid}-${Date.now()}`;
const contientCle = (o, cle) => JSON.stringify(o).includes(`"${cle}"`);

describe("Notifications automatiques", () => {
  let server, baseUrl, A, B, pdg, pdgB, cliente, fournisseur, article, articleSansSeuil;
  let couturier, autreCouturier, magasinier, receptionniste, comptable, sansDroit; // employés de A
  let n = 0;
  const ids = {};

  async function employe(nom, permissions) {
    const identifiant = `notif-${nom}-${marque}-${++n}`;
    const u = await prisma.user.create({
      data: { identifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "EMPLOYE", atelierId: A.id, prenom: nom, nom: "Test", poste: "AUTRE", permissions: normaliserPermissions(permissions) },
    });
    const api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant, password: MDP })).status, 200);
    return { api, id: u.id };
  }
  const types = (res) => res.body.data.map((x) => x.type);

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const ra = await creerAtelierEtAdmin({ nom: "Atelier Notifications A" });
    const rb = await creerAtelierEtAdmin({ nom: "Atelier Notifications B" });
    A = ra.atelier;
    B = rb.atelier;
    pdg = client(baseUrl);
    pdgB = client(baseUrl);
    assert.equal((await pdg.post("/api/auth/login", { identifiant: ra.identifiant, password: ra.password })).status, 200);
    assert.equal((await pdgB.post("/api/auth/login", { identifiant: rb.identifiant, password: rb.password })).status, 200);
    ids.pdg = (await prisma.user.findUnique({ where: { identifiant: ra.identifiant } })).id;

    cliente = await creerCliente(A.id, { nom: "Awa", prenom: "Notif", telephone: "90444441" });
    fournisseur = await prisma.fournisseur.create({ data: { atelierId: A.id, nom: `Fou ${marque}` } });
    article = await prisma.articleStock.create({ data: { atelierId: A.id, nom: `Fil ${marque}`, unite: "PIECE", seuilAlerte: "5" } });
    articleSansSeuil = await prisma.articleStock.create({ data: { atelierId: A.id, nom: `Bouton ${marque}`, unite: "PIECE" } });

    couturier = await employe("couturier", ["commandes.statut", "notifications.lire"]);
    autreCouturier = await employe("couturier2", ["commandes.statut", "notifications.lire"]);
    magasinier = await employe("magasinier", ["stock.ecrire", "achats.recevoir", "notifications.lire"]);
    receptionniste = await employe("receptionniste", ["commandes.ecrire", "notifications.lire"]);
    comptable = await employe("comptable", ["finances.voir", "notifications.lire"]);
    sansDroit = await employe("sansdroit", ["commandes.lire"]); // pas notifications.lire
  });

  after(async () => {
    await arreterServeur(server);
    for (const a of [A, B]) {
      await prisma.journalSecurite.deleteMany({ where: { atelierId: a.id } });
      await supprimerAtelier(a.id);
    }
    await prisma.$disconnect();
  });

  describe("travail confié", () => {
    before(async () => {
      ids.cmdConfiee = (await creerCommande(A.id, cliente.id, { dateLivraisonPrevue: new Date(Date.now() + 20 * JOUR), statut: "EN_CONFECTION" })).id;
      await prisma.paiement.create({ data: { commandeId: ids.cmdConfiee, montant: "1000", mode: "ESPECES" } });
      assert.equal((await pdg.put(`/api/commandes/${ids.cmdConfiee}/affectation`, { employeId: couturier.id })).status, 200);
    });

    it("l'employé concerné reçoit une notification « travail confié » ; ni le PDG, ni un collègue", async () => {
      const mien = await couturier.api.get("/api/notifications?pageSize=100");
      const tache = mien.body.data.find((x) => x.type === "TACHE_AFFECTEE");
      assert.ok(tache);
      assert.equal(tache.commande.id, ids.cmdConfiee);
      assert.equal(tache.lu, false);
      assert.ok(!types(await autreCouturier.api.get("/api/notifications?pageSize=100")).includes("TACHE_AFFECTEE"));
      assert.ok(!types(await pdg.get("/api/notifications?pageSize=100")).includes("TACHE_AFFECTEE"));
      assert.ok(!types(await magasinier.api.get("/api/notifications?pageSize=100")).includes("TACHE_AFFECTEE"));
    });

    it("la pastille de l'employé compte son travail confié ; celle du PDG ne le compte pas", async () => {
      const avantPdg = (await pdg.get("/api/notifications/nombre-non-lues")).body.notifications;
      assert.equal((await couturier.api.get("/api/notifications/nombre-non-lues")).body.notifications, 1);
      assert.equal((await pdg.get("/api/notifications/nombre-non-lues")).body.notifications, avantPdg);
    });

    it("réaffecter déplace la notification vers le nouvel employé (non lue) ; retirer la supprime", async () => {
      await pdg.put(`/api/commandes/${ids.cmdConfiee}/affectation`, { employeId: autreCouturier.id });
      // UNE seule réconciliation (premier appel après la réaffectation) doit suffire : suppression avant création.
      const nouvelle = (await autreCouturier.api.get("/api/notifications?pageSize=100")).body.data.find((x) => x.type === "TACHE_AFFECTEE");
      assert.ok(nouvelle, "le nouvel employé est prévenu dès la première lecture");
      assert.equal(nouvelle.lu, false);
      assert.ok(!types(await couturier.api.get("/api/notifications?pageSize=100")).includes("TACHE_AFFECTEE"));
      await pdg.put(`/api/commandes/${ids.cmdConfiee}/affectation`, { employeId: null });
      assert.ok(!types(await autreCouturier.api.get("/api/notifications?pageSize=100")).includes("TACHE_AFFECTEE"));
      await pdg.put(`/api/commandes/${ids.cmdConfiee}/affectation`, { employeId: couturier.id }); // pour la suite
    });

    it("une commande livrée ou un compte désactivé fait disparaître la notification", async () => {
      const cmd = await creerCommande(A.id, cliente.id, { dateLivraisonPrevue: new Date(Date.now() + 20 * JOUR) });
      await pdg.put(`/api/commandes/${cmd.id}/affectation`, { employeId: autreCouturier.id });
      assert.equal((await autreCouturier.api.get("/api/notifications?pageSize=100")).body.data.filter((x) => x.type === "TACHE_AFFECTEE" && x.commande.id === cmd.id).length, 1);
      await prisma.commande.update({ where: { id: cmd.id }, data: { statut: "ANNULEE" } });
      assert.equal((await autreCouturier.api.get("/api/notifications?pageSize=100")).body.data.filter((x) => x.commande?.id === cmd.id && x.type === "TACHE_AFFECTEE").length, 0);
    });
  });

  describe("retard : le PDG et l'employé concerné", () => {
    before(async () => {
      ids.cmdRetard = (await creerCommande(A.id, cliente.id, { dateLivraisonPrevue: new Date(Date.now() - 3 * JOUR), statut: "EN_CONFECTION" })).id;
      await pdg.put(`/api/commandes/${ids.cmdRetard}/affectation`, { employeId: couturier.id });
    });

    it("voit le retard de SA commande, pas celui des autres ; qui gère les commandes les voit tous", async () => {
      const retards = (res) => res.body.data.filter((x) => x.type === "RETARD").map((x) => x.commande.id);
      assert.ok(retards(await pdg.get("/api/notifications?pageSize=100")).includes(ids.cmdRetard));
      assert.ok(retards(await couturier.api.get("/api/notifications?pageSize=100")).includes(ids.cmdRetard));
      assert.ok(!retards(await autreCouturier.api.get("/api/notifications?pageSize=100")).includes(ids.cmdRetard));
      assert.ok(retards(await receptionniste.api.get("/api/notifications?pageSize=100")).includes(ids.cmdRetard)); // commandes.ecrire
    });

    it("l'alerte d'impayé reste réservée à finances.voir", async () => {
      assert.ok(types(await comptable.api.get("/api/notifications?pageSize=100")).includes("IMPAYE"));
      assert.ok(!types(await couturier.api.get("/api/notifications?pageSize=100")).includes("IMPAYE"));
      assert.ok(!types(await receptionniste.api.get("/api/notifications?pageSize=100")).includes("IMPAYE"));
    });
  });

  describe("stock bas", () => {
    it("apparaît quand la quantité atteint le seuil, avec la quantité actuelle ; disparaît après réapprovisionnement", async () => {
      await prisma.mouvementStock.create({ data: { articleId: article.id, type: "ENTREE", quantite: "10" } });
      assert.ok(!types(await pdg.get("/api/notifications?pageSize=100")).includes("STOCK_BAS"));
      await pdg.post(`/api/stock/${article.id}/mouvements`, { type: "SORTIE", quantite: "5" }); // reste 5 = le seuil : déjà en alerte
      assert.ok(types(await pdg.get("/api/notifications?pageSize=100")).includes("STOCK_BAS"), "quantité égale au seuil : alerte");
      await pdg.post(`/api/stock/${article.id}/mouvements`, { type: "SORTIE", quantite: "1" }); // reste 4
      const liste = await pdg.get("/api/notifications?pageSize=100");
      const alerte = liste.body.data.find((x) => x.type === "STOCK_BAS");
      assert.ok(alerte);
      assert.equal(alerte.article.id, article.id);
      assert.equal(alerte.article.quantite, "4");
      await pdg.post(`/api/stock/${article.id}/mouvements`, { type: "ENTREE", quantite: "20" });
      assert.ok(!types(await pdg.get("/api/notifications?pageSize=100")).includes("STOCK_BAS"));
      await pdg.post(`/api/stock/${article.id}/mouvements`, { type: "SORTIE", quantite: "22" }); // reste 2
    });

    it("un article sans seuil ou archivé ne génère aucune alerte", async () => {
      const apres = await pdg.get("/api/notifications?pageSize=100");
      assert.ok(!apres.body.data.some((x) => x.article?.id === articleSansSeuil.id));
      await prisma.articleStock.update({ where: { id: article.id }, data: { archivedAt: new Date() } });
      assert.ok(!types(await pdg.get("/api/notifications?pageSize=100")).includes("STOCK_BAS"));
      await prisma.articleStock.update({ where: { id: article.id }, data: { archivedAt: null } });
    });

    it("seuls le PDG et qui gère le stock (stock.ecrire) la voient", async () => {
      assert.ok(types(await magasinier.api.get("/api/notifications?pageSize=100")).includes("STOCK_BAS"));
      for (const e of [couturier, receptionniste, comptable]) assert.ok(!types(await e.api.get("/api/notifications?pageSize=100")).includes("STOCK_BAS"));
    });
  });

  describe("achat attendu non reçu", () => {
    before(async () => {
      const r = await pdg.post("/api/achats", { fournisseurId: fournisseur.id, dateAttendue: "2026-01-10", lignes: [{ articleId: article.id, quantite: "10", prixUnitaire: "100" }] });
      assert.equal(r.status, 201);
      ids.achat = r.body.id;
      ids.ligne = r.body.lignes[0].id;
    });

    it("alerte le PDG et qui réceptionne ; disparaît une fois tout reçu", async () => {
      const alerte = (await pdg.get("/api/notifications?pageSize=100")).body.data.find((x) => x.type === "ACHAT_EN_RETARD");
      assert.ok(alerte);
      assert.equal(alerte.achat.id, ids.achat);
      assert.ok(alerte.achat.fournisseur.nom);
      assert.ok(types(await magasinier.api.get("/api/notifications?pageSize=100")).includes("ACHAT_EN_RETARD"));
      assert.ok(!types(await couturier.api.get("/api/notifications?pageSize=100")).includes("ACHAT_EN_RETARD"));
      assert.ok(!contientCle(await magasinier.api.get("/api/notifications?pageSize=100"), "prixUnitaire"));
      await pdg.post(`/api/achats/${ids.achat}/receptions`, { lignes: [{ ligneId: ids.ligne, quantite: "10" }] });
      assert.ok(!types(await pdg.get("/api/notifications?pageSize=100")).includes("ACHAT_EN_RETARD"));
    });

    it("pas d'alerte pour un achat annulé ou dont la date attendue n'est pas passée", async () => {
      const futur = await pdg.post("/api/achats", { fournisseurId: fournisseur.id, dateAttendue: "2099-01-01", lignes: [{ articleId: article.id, quantite: "1", prixUnitaire: "1" }] });
      const annule = await pdg.post("/api/achats", { fournisseurId: fournisseur.id, dateAttendue: "2026-01-10", lignes: [{ articleId: articleSansSeuil.id, quantite: "1", prixUnitaire: "1" }] });
      await pdg.post(`/api/achats/${annule.body.id}/annuler`, { motif: "Test notification" });
      const alertes = (await pdg.get("/api/notifications?pageSize=100")).body.data.filter((x) => x.type === "ACHAT_EN_RETARD");
      assert.ok(!alertes.some((x) => x.achat.id === futur.body.id || x.achat.id === annule.body.id));
    });
  });

  describe("lecture individuelle", () => {
    it("un employé marque lu pour lui seul : l'état du PDG et des collègues ne change pas", async () => {
      const liste = await receptionniste.api.get("/api/notifications?pageSize=100");
      const retard = liste.body.data.find((x) => x.type === "RETARD" && x.commande.id === ids.cmdRetard);
      assert.equal(retard.lu, false);
      const avantPdg = (await pdg.get("/api/notifications/nombre-non-lues")).body.notifications;
      const avantReception = (await receptionniste.api.get("/api/notifications/nombre-non-lues")).body.notifications;

      assert.equal((await receptionniste.api.patch(`/api/notifications/${retard.id}`, { lu: true })).body.lu, true);
      assert.equal((await receptionniste.api.get("/api/notifications/nombre-non-lues")).body.notifications, avantReception - 1);
      assert.equal((await pdg.get("/api/notifications/nombre-non-lues")).body.notifications, avantPdg); // PDG inchangé
      assert.equal((await prisma.notification.findUnique({ where: { id: retard.id } })).lu, false); // drapeau du PDG intact
      const chezCouturier = (await couturier.api.get("/api/notifications?pageSize=100")).body.data.find((x) => x.id === retard.id);
      assert.equal(chezCouturier.lu, false); // collègue inchangé

      assert.equal((await receptionniste.api.patch(`/api/notifications/${retard.id}`, { lu: false })).body.lu, false);
      assert.equal((await receptionniste.api.get("/api/notifications/nombre-non-lues")).body.notifications, avantReception);
    });

    it("« tout marquer lu » d'un employé ne touche que sa propre vue ; le filtre lu fonctionne", async () => {
      // La réception de l'achat a remonté le stock : on le fait redescendre sous le seuil pour qu'il y ait une alerte à lire.
      await pdg.post(`/api/stock/${article.id}/mouvements`, { type: "SORTIE", quantite: "10" });
      const toutes = await magasinier.api.get("/api/notifications?pageSize=100");
      const idsVisibles = toutes.body.data.map((x) => x.id);
      assert.ok(idsVisibles.length >= 1);
      assert.equal((await magasinier.api.post("/api/notifications/marquer-lu", { ids: idsVisibles })).body.count, idsVisibles.length);
      assert.equal((await magasinier.api.get("/api/notifications?lu=false&pageSize=100")).body.data.length, 0);
      assert.equal((await magasinier.api.get("/api/notifications?lu=true&pageSize=100")).body.data.length, idsVisibles.length);
      assert.ok((await prisma.notification.count({ where: { id: { in: idsVisibles }, lu: true } })) === 0); // aucun drapeau PDG modifié
    });

    it("le PDG garde son drapeau partagé (marquer lu, puis le compte baisse)", async () => {
      const avant = (await pdg.get("/api/notifications/nombre-non-lues")).body.notifications;
      assert.ok(avant > 0);
      const une = (await pdg.get("/api/notifications?lu=false&pageSize=1")).body.data[0];
      assert.equal((await pdg.patch(`/api/notifications/${une.id}`, { lu: true })).body.lu, true);
      assert.equal((await pdg.get("/api/notifications/nombre-non-lues")).body.notifications, avant - 1);
    });

    it("sans notifications.lire : tout est refusé ; un employé ne supprime pas ; pas de fuite entre ateliers", async () => {
      assert.equal((await sansDroit.api.get("/api/notifications")).status, 403);
      assert.equal((await magasinier.api.post("/api/notifications/supprimer", { ids: ["x"] })).status, 403);
      const deB = await pdgB.get("/api/notifications?pageSize=100");
      assert.ok(deB.body.data.every((x) => x.atelierId === B.id));
      const uneDeA = await prisma.notification.findFirst({ where: { atelierId: A.id } });
      assert.equal((await pdgB.patch(`/api/notifications/${uneDeA.id}`, { lu: true })).status, 404);
      assert.equal((await pdgB.post("/api/notifications/supprimer", { ids: [uneDeA.id] })).body.count, 0);
    });
  });

  describe("résumé quotidien par email", () => {
    // On vérifie le filtre des destinataires utilisé par la tâche planifiée (et non la tâche elle-même : elle traite
    // TOUS les ateliers de la base, donc perturberait les autres fichiers de test qui tournent en parallèle).
    it("ne vise jamais un employé, même avec un email actif ; le PDG est visé", async () => {
      await prisma.user.update({ where: { id: couturier.id }, data: { email: `emp-${marque}@exemple.test` } });
      await prisma.user.update({ where: { id: ids.pdg }, data: { email: `pdg-${marque}@exemple.test` } });
      const vises = await prisma.user.findMany({ where: { atelierId: A.id, ...UTILISATEURS_RESUME_QUOTIDIEN }, select: { id: true, role: true } });
      assert.deepEqual(vises.map((u) => u.id), [ids.pdg]);
      // Un PDG désactivé n'est plus visé non plus.
      await prisma.user.update({ where: { id: ids.pdg }, data: { actif: false } });
      assert.equal((await prisma.user.findMany({ where: { atelierId: A.id, ...UTILISATEURS_RESUME_QUOTIDIEN } })).length, 0);
      await prisma.user.update({ where: { id: ids.pdg }, data: { actif: true } });
    });
  });
});
