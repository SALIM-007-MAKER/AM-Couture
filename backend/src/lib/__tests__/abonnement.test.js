import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "../../generated/prisma/client.ts";
import {
  calculerDateExpiration,
  statutEffectif,
  etatAbonnementAtelier,
  modeAcces,
  dateDebutSouscription,
  prixPourDuree,
} from "../abonnement.js";

const J = 86_400_000;
const NOW = new Date("2026-11-15T12:00:00Z");
const jours = (n) => new Date(NOW.getTime() + n * J);
const abo = (statut, debutJ, finJ) => ({ statut, dateDebut: jours(debutJ), dateExpiration: jours(finJ) });
const GRACE = { joursGrace: 7 };

describe("calculerDateExpiration", () => {
  it("compte en mois civils, pas en blocs de 30 jours", () => {
    assert.equal(calculerDateExpiration(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10), "2026-03-03");
    assert.equal(calculerDateExpiration(new Date("2026-01-15T00:00:00Z"), 12).toISOString().slice(0, 10), "2027-01-15");
  });
});

describe("statutEffectif", () => {
  it("dérive ACTIF / EXPIRE / EN_ATTENTE des dates", () => {
    assert.equal(statutEffectif(abo("CONFIRME", -10, 10), NOW), "ACTIF");
    assert.equal(statutEffectif(abo("CONFIRME", -20, -1), NOW), "EXPIRE");
    assert.equal(statutEffectif(abo("CONFIRME", 5, 35), NOW), "EN_ATTENTE");
    assert.equal(statutEffectif({ statut: "EN_ATTENTE" }, NOW), "EN_ATTENTE");
  });
  it("ANNULE et SUSPENDU priment sur les dates", () => {
    assert.equal(statutEffectif(abo("ANNULE", -10, 10), NOW), "ANNULE");
    assert.equal(statutEffectif(abo("SUSPENDU", -10, 10), NOW), "SUSPENDU");
  });
});

describe("etatAbonnementAtelier", () => {
  const essaiEnCours = { trialEndsAt: jours(5) };
  const essaiFini = { trialEndsAt: jours(-3) };
  it("un abonnement actif l'emporte sur l'essai", () => {
    assert.equal(etatAbonnementAtelier(essaiEnCours, [abo("CONFIRME", -1, 30)], NOW).statut, "ACTIF");
  });
  it("essai seul", () => assert.equal(etatAbonnementAtelier(essaiEnCours, [], NOW).statut, "ESSAI"));
  it("essai terminé sans abonnement : EXPIRE", () => assert.equal(etatAbonnementAtelier(essaiFini, [], NOW).statut, "EXPIRE"));
  it("atelier ancien sans échéance d'essai : AUCUN", () => assert.equal(etatAbonnementAtelier({ trialEndsAt: null }, [], NOW).statut, "AUCUN"));
  it("abonnement suspendu non échu : état SUSPENDU, même pendant un essai écoulé", () => {
    assert.equal(etatAbonnementAtelier(essaiFini, [abo("SUSPENDU", -10, 20)], NOW).statut, "SUSPENDU");
  });
  it("abonnement suspendu déjà échu : simple EXPIRE", () => {
    assert.equal(etatAbonnementAtelier(essaiFini, [abo("SUSPENDU", -40, -10)], NOW).statut, "EXPIRE");
  });
  it("un abonnement actif l'emporte sur un autre suspendu", () => {
    assert.equal(etatAbonnementAtelier(essaiFini, [abo("SUSPENDU", -10, 20), abo("CONFIRME", -5, 25)], NOW).statut, "ACTIF");
  });
});

describe("modeAcces — grâce puis lecture seule", () => {
  const mode = (atelier, abos) => modeAcces(etatAbonnementAtelier(atelier, abos, NOW), abos, GRACE, NOW);
  it("accès complet pendant l'essai, avec un abonnement actif et pour un atelier ancien", () => {
    assert.equal(mode({ trialEndsAt: jours(5) }, []).mode, "COMPLET");
    assert.equal(mode({ trialEndsAt: jours(-30) }, [abo("CONFIRME", -1, 30)]).mode, "COMPLET");
    assert.equal(mode({ trialEndsAt: null }, []).mode, "COMPLET");
  });
  it("essai terminé depuis 3 jours : grâce, 4 jours restants", () => {
    const r = mode({ trialEndsAt: jours(-3) }, []);
    assert.equal(r.mode, "GRACE");
    assert.equal(r.joursGraceRestants, 4);
  });
  it("essai terminé depuis plus de 7 jours : lecture seule", () => {
    assert.equal(mode({ trialEndsAt: jours(-8) }, []).mode, "LECTURE_SEULE");
  });
  it("la grâce court depuis la fin du DERNIER droit, essai ou abonnement", () => {
    assert.equal(mode({ trialEndsAt: jours(-60) }, [abo("CONFIRME", -40, -2)]).mode, "GRACE");
    assert.equal(mode({ trialEndsAt: jours(-60) }, [abo("CONFIRME", -40, -9)]).mode, "LECTURE_SEULE");
  });
  it("un abonnement planifié ne supprime pas la grâce de l'abonnement précédent", () => {
    assert.equal(mode({ trialEndsAt: jours(-60) }, [abo("CONFIRME", -40, -2), abo("CONFIRME", 10, 40)]).mode, "GRACE");
  });
  it("abonnement suspendu : lecture seule immédiate, sans grâce", () => {
    assert.equal(mode({ trialEndsAt: jours(-60) }, [abo("SUSPENDU", -10, 20)]).mode, "LECTURE_SEULE");
  });
  it("grâce à 0 jour : lecture seule dès l'échéance", () => {
    const abos = [];
    const etat = etatAbonnementAtelier({ trialEndsAt: jours(-1) }, abos, NOW);
    assert.equal(modeAcces(etat, abos, { joursGrace: 0 }, NOW).mode, "LECTURE_SEULE");
  });
});

describe("dateDebutSouscription — renouvellement sans perte de jours", () => {
  it("sans abonnement en cours : maintenant", () => {
    assert.deepEqual(dateDebutSouscription([], NOW), NOW);
    assert.deepEqual(dateDebutSouscription([abo("CONFIRME", -40, -10)], NOW), NOW);
  });
  it("avec un abonnement actif : à son échéance", () => {
    assert.deepEqual(dateDebutSouscription([abo("CONFIRME", -5, 12)], NOW), jours(12));
  });
  it("avec une chaîne d'abonnements planifiés : après le dernier", () => {
    assert.deepEqual(dateDebutSouscription([abo("CONFIRME", -5, 12), abo("CONFIRME", 12, 42)], NOW), jours(42));
  });
  it("ignore les abonnements en attente de paiement, annulés et suspendus", () => {
    const abos = [{ statut: "EN_ATTENTE", dateExpiration: null }, abo("ANNULE", -5, 99), abo("SUSPENDU", -5, 99)];
    assert.deepEqual(dateDebutSouscription(abos, NOW), NOW);
  });
});

describe("prixPourDuree", () => {
  const plan = { prixMensuel: new Prisma.Decimal(5000), tarifsDuree: [{ dureeMois: 1, remisePourcent: 0 }, { dureeMois: 12, remisePourcent: 20 }] };
  it("applique la remise de la durée", () => {
    assert.equal(prixPourDuree(plan, 1).toString(), "5000");
    assert.equal(prixPourDuree(plan, 12).toString(), "48000");
  });
  it("durée non proposée : pas de remise", () => assert.equal(prixPourDuree(plan, 3).toString(), "15000"));
});
