import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estEnRetard, estAffectable, debutDuJour, STATUTS_OUVERTS } from "../production.js";

const midi = new Date("2026-11-20T12:00:00Z");

describe("production", () => {
  it("le jour même de la date prévue, la commande n'est pas en retard ; le lendemain, elle l'est", () => {
    assert.equal(estEnRetard({ statut: "EN_CONFECTION", dateLivraisonPrevue: new Date("2026-11-20T00:00:00Z") }, midi), false);
    assert.equal(estEnRetard({ statut: "EN_CONFECTION", dateLivraisonPrevue: new Date("2026-11-19T23:59:00Z") }, midi), true);
  });

  it("une commande livrée ou annulée n'est jamais en retard", () => {
    const passee = new Date("2026-01-01T00:00:00Z");
    assert.equal(estEnRetard({ statut: "LIVREE", dateLivraisonPrevue: passee }, midi), false);
    assert.equal(estEnRetard({ statut: "ANNULEE", dateLivraisonPrevue: passee }, midi), false);
    assert.equal(estEnRetard({ statut: "TERMINEE", dateLivraisonPrevue: passee }, midi), true);
  });

  it("seules les commandes ouvertes sont affectables", () => {
    for (const s of STATUTS_OUVERTS) assert.equal(estAffectable(s), true);
    assert.equal(estAffectable("LIVREE"), false);
    assert.equal(estAffectable("ANNULEE"), false);
  });

  it("debutDuJour ramène à minuit UTC", () => {
    assert.equal(debutDuJour(midi).toISOString(), "2026-11-20T00:00:00.000Z");
  });
});
