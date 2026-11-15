// Sous-phase 3.3 — contraintes CHECK (anomalie 7). Elles reprennent EXACTEMENT les bornes que la
// validation applicative (Zod) impose déjà : la base refuse ce que l'application refuse, même si une
// écriture contourne l'API (script, console SQL, futur code). Ajoutées en `NOT VALID` : elles contrôlent
// les nouvelles écritures sans lire les anciennes lignes (voir docs/CONTRAINTES-CHECK.md).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur } from "./helpers.js";
import { preparerAtelier, creerCommandeApi, nettoyerAtelier } from "./concurrence-helpers.js";

const refus = async (fn, libelle) => {
  try {
    await fn();
  } catch (e) {
    const code = e?.meta?.driverAdapterError?.cause?.originalCode;
    const texte = `${e?.message ?? ""} ${JSON.stringify(e?.meta ?? {})}`;
    assert.ok(code === "23514" || /check constraint|CheckConstraint/i.test(texte), `${libelle} : refusé, mais pas par une contrainte CHECK (${String(e?.message).replace(/\s+/g, " ").slice(0, 160)})`);
    return;
  }
  assert.fail(`${libelle} : la base a ACCEPTÉ une valeur invalide`);
};

describe("Intégrité — contraintes CHECK (bornes de la validation applicative)", () => {
  let server, baseUrl, ctx, commande, article;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    ctx = await preparerAtelier(baseUrl, "Atelier Contraintes CHECK");
    commande = await creerCommandeApi(ctx.api, ctx.cliente.id, { prixTotal: "10000" });
    article = await prisma.articleStock.create({ data: { atelierId: ctx.atelier.id, nom: `Fil ${process.pid}`, unite: "PIECE" } });
  });

  after(async () => {
    await arreterServeur(server);
    await prisma.mouvementStock.deleteMany({ where: { articleId: article.id } });
    await nettoyerAtelier(ctx.atelier.id, [ctx.admin.id]);
    await prisma.$disconnect();
  });

  it("Paiement.montant : 0 et négatif refusés, 0,01 accepté", async () => {
    for (const m of ["0", "-500", "0.00"]) await refus(() => prisma.paiement.create({ data: { commandeId: commande.id, montant: m, mode: "ESPECES" } }), `paiement ${m}`);
    const ok = await prisma.paiement.create({ data: { commandeId: commande.id, montant: "0.01", mode: "ESPECES" } });
    await prisma.paiement.delete({ where: { id: ok.id } });
  });

  it("Commande.prixTotal : 0 et négatif refusés (création et modification) ; quantite hors de 1 à 50 refusée", async () => {
    const base = { atelierId: ctx.atelier.id, clienteId: ctx.cliente.id, typeVetement: "ROBE", dateLivraisonPrevue: new Date(), numero: `TEST-CHK-${process.pid}-` };
    await refus(() => prisma.commande.create({ data: { ...base, numero: base.numero + "a", prixTotal: "0" } }), "création prixTotal 0");
    await refus(() => prisma.commande.update({ where: { id: commande.id }, data: { prixTotal: "-1" } }), "modification prixTotal -1");
    await refus(() => prisma.commande.update({ where: { id: commande.id }, data: { quantite: 0 } }), "quantite 0");
    await refus(() => prisma.commande.update({ where: { id: commande.id }, data: { quantite: 51 } }), "quantite 51");
    for (const q of [1, 50]) await prisma.commande.update({ where: { id: commande.id }, data: { quantite: q } });
    await prisma.commande.update({ where: { id: commande.id }, data: { quantite: 1 } });
  });

  it("Depense.montant : 0 et négatif refusés", async () => {
    for (const m of ["0", "-10"]) await refus(() => prisma.depense.create({ data: { atelierId: ctx.atelier.id, categorie: "TISSU", montant: m } }), `dépense ${m}`);
    const ok = await prisma.depense.create({ data: { atelierId: ctx.atelier.id, categorie: "TISSU", montant: "0.01" } });
    await prisma.depense.delete({ where: { id: ok.id } });
  });

  it("MouvementStock.quantite : 0 et négatif refusés", async () => {
    for (const q of ["0", "-1"]) await refus(() => prisma.mouvementStock.create({ data: { articleId: article.id, type: "ENTREE", quantite: q } }), `mouvement ${q}`);
    const ok = await prisma.mouvementStock.create({ data: { articleId: article.id, type: "ENTREE", quantite: "0.01" } });
    await prisma.mouvementStock.delete({ where: { id: ok.id } });
  });

  it("Livraison.montantRestant : négatif refusé, 0 accepté", async () => {
    await refus(() => prisma.livraison.create({ data: { commandeId: commande.id, montantRestant: "-1" } }), "livraison -1");
    const ok = await prisma.livraison.create({ data: { commandeId: commande.id, montantRestant: "0" } });
    await prisma.livraison.delete({ where: { id: ok.id } });
  });

  it("Recu.montantPaye : 0 et négatif refusés", async () => {
    for (const m of ["0", "-5"]) await refus(() => prisma.recu.create({ data: { commandeId: commande.id, numero: `TEST-RECU-${process.pid}-${m}`, montantPaye: m } }), `reçu ${m}`);
  });

  it("Modele.prixIndicatif, ArticleStock.seuilAlerte et prixUnitaire : bornes respectées, valeurs absentes acceptées", async () => {
    const nom = `Modèle CHK ${process.pid}`;
    await refus(() => prisma.modele.create({ data: { atelierId: ctx.atelier.id, nom, categorie: "ROBE", prixIndicatif: "0" } }), "prixIndicatif 0");
    const m = await prisma.modele.create({ data: { atelierId: ctx.atelier.id, nom, categorie: "ROBE" } });
    await prisma.modele.delete({ where: { id: m.id } });
    await refus(() => prisma.articleStock.update({ where: { id: article.id }, data: { seuilAlerte: "-1" } }), "seuilAlerte -1");
    await refus(() => prisma.articleStock.update({ where: { id: article.id }, data: { prixUnitaire: "0" } }), "prixUnitaire 0");
    await prisma.articleStock.update({ where: { id: article.id }, data: { seuilAlerte: "0", prixUnitaire: "0.01" } });
    await prisma.articleStock.update({ where: { id: article.id }, data: { seuilAlerte: null, prixUnitaire: null } });
  });

  it("Abonnement.prix, PlanAbonnement.prixMensuel, FormuleAbonnement.prix : négatif refusé, 0 accepté", async () => {
    await refus(() => prisma.abonnement.create({ data: { atelierId: ctx.atelier.id, numero: `TEST-ABN-${process.pid}-n`, prix: "-1" } }), "abonnement -1");
    const a = await prisma.abonnement.create({ data: { atelierId: ctx.atelier.id, numero: `TEST-ABN-${process.pid}-0`, prix: "0" } });
    await prisma.abonnement.delete({ where: { id: a.id } });
    await refus(() => prisma.planAbonnement.create({ data: { nom: `Plan CHK ${process.pid}`, prixMensuel: "-1" } }), "plan -1");
    const p = await prisma.planAbonnement.create({ data: { nom: `Plan CHK0 ${process.pid}`, prixMensuel: "0" } });
    await prisma.planAbonnement.delete({ where: { id: p.id } });
    const formule = await prisma.formuleAbonnement.findFirst();
    if (formule) await refus(() => prisma.formuleAbonnement.update({ where: { id: formule.id }, data: { prix: "-1" } }), "formule -1");
  });

  // ───────────── Effet de NOT VALID et pré-contrôle (tout est annulé en fin de transaction)
  const ANNULER = "ROLLBACK_VOULU";
  const enTransactionAnnulee = async (fn) => {
    try {
      await prisma.$transaction(async (tx) => { await fn(tx); throw new Error(ANNULER); }, { timeout: 20_000 });
    } catch (e) {
      if (e.message !== ANNULER) throw e;
    }
  };

  it("NOT VALID : une ANCIENNE ligne invalide est tolérée à la lecture mais sa MODIFICATION est refusée (risque documenté)", async () => {
    await enTransactionAnnulee(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE "Paiement" DROP CONSTRAINT "Paiement_montant_positif_chk"');
      await tx.$executeRawUnsafe(`INSERT INTO "Paiement"(id,"commandeId",montant,mode) VALUES ('legacy-${process.pid}','${commande.id}',0,'ESPECES')`);
      await tx.$executeRawUnsafe('ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_montant_positif_chk" CHECK ("montant" >= 0.01) NOT VALID');
      // lecture : tolérée
      const lues = await tx.$queryRawUnsafe(`SELECT id FROM "Paiement" WHERE id = 'legacy-${process.pid}'`);
      assert.equal(lues.length, 1);
      // nouvelle écriture invalide : refusée
      await tx.$executeRawUnsafe("SAVEPOINT s1");
      await assert.rejects(() => tx.$executeRawUnsafe(`INSERT INTO "Paiement"(id,"commandeId",montant,mode) VALUES ('nouveau-${process.pid}','${commande.id}',0,'ESPECES')`), /23514|check/i);
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT s1");
      // MODIFICATION de l'ancienne ligne (ex. annulation) : refusée aussi → d'où le pré-contrôle obligatoire
      await assert.rejects(() => tx.$executeRawUnsafe(`UPDATE "Paiement" SET "annuleAt" = now() WHERE id = 'legacy-${process.pid}'`), /23514|check/i);
    });
  });

  const requetesPreContrôle = () => {
    const texte = fs.readFileSync(new URL("../../../scripts/preflight-contraintes.sql", import.meta.url), "utf8");
    const blocs = texte.split(/^-- @requete /m).slice(1);
    return blocs.map((b) => ({ nom: b.split("\n")[0].trim(), sql: b.split("\n").slice(1).join("\n").replace(/^--.*$/gm, "").trim().replace(/;\s*$/, "") }));
  };

  it("pré-contrôle : le script couvre chaque contrainte et ne renvoie AUCUNE ligne sur des données valides", async () => {
    const requetes = requetesPreContrôle();
    assert.ok(requetes.length >= 12, `${requetes.length} requêtes trouvées`);
    for (const r of requetes) {
      const lignes = await prisma.$queryRawUnsafe(r.sql);
      assert.equal(lignes.length, 0, `${r.nom} : ${lignes.length} ligne(s) invalide(s) sur des données valides`);
    }
  });

  it("pré-contrôle : il DÉTECTE une ligne invalide (paiement à 0 hérité)", async () => {
    await enTransactionAnnulee(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE "Paiement" DROP CONSTRAINT "Paiement_montant_positif_chk"');
      await tx.$executeRawUnsafe(`INSERT INTO "Paiement"(id,"commandeId",montant,mode) VALUES ('legacy2-${process.pid}','${commande.id}',0,'ESPECES')`);
      const requete = requetesPreContrôle().find((r) => /Paiement/.test(r.nom));
      assert.ok(requete, "requête Paiement introuvable dans le script");
      const lignes = await tx.$queryRawUnsafe(requete.sql);
      assert.ok(lignes.length >= 1, "le pré-contrôle n'a pas signalé le paiement invalide");
    });
  });
});
