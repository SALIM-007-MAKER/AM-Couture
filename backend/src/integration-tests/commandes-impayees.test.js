// Définition d'une commande « impayée » (aucun encaissement réel), partagée par le tableau de bord et les
// notifications. Test de caractérisation : il fixe le comportement avant/après la réécriture en NOT EXISTS
// (la version précédente chargeait en mémoire tous les identifiants de commandes payées puis les passait en
// `notIn`, ce qui échoue au-delà de 32 767 paramètres de requête — voir docs/PERFORMANCES.md).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { whereCommandesImpayees } from "../lib/commandesImpayees.js";
import { creerAtelierEtAdmin, creerCliente, creerCommande, supprimerAtelier } from "./helpers.js";

describe("Commandes impayées — définition partagée", () => {
  let A, B, cliA, cliB;
  const c = {};

  before(async () => {
    A = await creerAtelierEtAdmin({ nom: "Impayées A" });
    B = await creerAtelierEtAdmin({ nom: "Impayées B" });
    cliA = await creerCliente(A.atelier.id);
    cliB = await creerCliente(B.atelier.id);
    c.sansPaiement = await creerCommande(A.atelier.id, cliA.id);
    c.payee = await creerCommande(A.atelier.id, cliA.id);
    c.paiementAnnuleSeul = await creerCommande(A.atelier.id, cliA.id);
    c.annulee = await creerCommande(A.atelier.id, cliA.id, { statut: "ANNULEE" });
    c.payeeEtAnnulee = await creerCommande(A.atelier.id, cliA.id);
    c.autreAtelierPayee = await creerCommande(B.atelier.id, cliB.id);

    const p = (commandeId, extra = {}) => prisma.paiement.create({ data: { commandeId, montant: "1000", mode: "ESPECES", ...extra } });
    await p(c.payee.id);
    await p(c.paiementAnnuleSeul.id, { annuleAt: new Date(), annuleMotif: "erreur" });
    await p(c.payeeEtAnnulee.id);
    await p(c.payeeEtAnnulee.id, { annuleAt: new Date(), annuleMotif: "erreur" });
    await p(c.autreAtelierPayee.id);
  });

  after(async () => {
    await supprimerAtelier(A.atelier.id);
    await supprimerAtelier(B.atelier.id);
  });

  it("ne retient que les commandes sans aucun paiement actif, hors annulées, de l'atelier demandé", async () => {
    const where = await whereCommandesImpayees(prisma, A.atelier.id);
    const ids = (await prisma.commande.findMany({ where, select: { id: true } })).map((x) => x.id).sort();
    assert.deepEqual(ids, [c.sansPaiement.id, c.paiementAnnuleSeul.id].sort());
  });

  it("le paiement d'un autre atelier n'a aucun effet (cloisonnement)", async () => {
    const where = await whereCommandesImpayees(prisma, B.atelier.id);
    assert.equal(await prisma.commande.count({ where }), 0);
  });
});
