import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planifierRappel, contenuRappel, formatDateFr } from "../rappelsAbonnement.js";

const J = 86_400_000;
const NOW = new Date("2026-11-15T12:00:00Z");
const jours = (n) => new Date(NOW.getTime() + n * J);
const abo = (statut, debutJ, finJ) => ({ statut, dateDebut: jours(debutJ), dateExpiration: jours(finJ) });
const plan = (trialJ, abonnements = [], extra = {}) =>
  planifierRappel({ trialEndsAt: trialJ === null ? null : jours(trialJ), abonnements, paiementEnAttente: false, joursGrace: 7, ...extra }, NOW);

describe("planifierRappel — fin d'essai", () => {
  it("rien tant que l'échéance est lointaine", () => assert.equal(plan(10), null));
  it("à 3 jours ou moins : ESSAI_J3 ; à 1 jour ou moins : ESSAI_J1", () => {
    assert.equal(plan(3)?.type, "ESSAI_J3");
    assert.equal(plan(2.5)?.type, "ESSAI_J3");
    assert.equal(plan(1)?.type, "ESSAI_J1");
    assert.equal(plan(0.4)?.type, "ESSAI_J1");
  });
  it("la clé identifie l'échéance (date du jour de fin d'essai)", () => {
    assert.equal(plan(2)?.cle, "2026-11-17");
  });
  it("essai terminé depuis 2 jours : ESSAI_FIN avec la date de fin de grâce", () => {
    const r = plan(-2);
    assert.equal(r.type, "ESSAI_FIN");
    assert.equal(r.graceJusquAu.getTime(), jours(-2).getTime() + 7 * J);
  });
  it("essai terminé depuis longtemps : aucun rappel (pas de courriel aux ateliers abandonnés)", () => {
    assert.equal(plan(-30), null);
    assert.equal(plan(-11), null);
    assert.notEqual(plan(-9.9), null);
  });
  it("atelier ancien sans échéance d'essai : jamais de rappel", () => assert.equal(plan(null, [abo("CONFIRME", -50, 2)]), null));
});

describe("planifierRappel — échéance d'abonnement", () => {
  it("J7, J3, J1 selon les jours restants", () => {
    assert.equal(plan(-60, [abo("CONFIRME", -25, 6)])?.type, "ABO_J7");
    assert.equal(plan(-60, [abo("CONFIRME", -25, 3)])?.type, "ABO_J3");
    assert.equal(plan(-60, [abo("CONFIRME", -25, 1)])?.type, "ABO_J1");
  });
  it("rien au-delà de 7 jours", () => assert.equal(plan(-60, [abo("CONFIRME", -5, 25)]), null));
  it("un renouvellement planifié à la suite repousse l'échéance : pas de rappel", () => {
    assert.equal(plan(-60, [abo("CONFIRME", -25, 5), abo("CONFIRME", 5, 35)]), null);
  });
  it("un renouvellement qui démarre quelques heures après l'échéance prolonge quand même la couverture", () => {
    assert.equal(plan(-60, [abo("CONFIRME", -25, 5), abo("CONFIRME", 5.5, 35)]), null);
  });
  it("un renouvellement qui démarre plusieurs jours après l'échéance ne la prolonge pas : le rappel part", () => {
    assert.equal(plan(-60, [abo("CONFIRME", -25, 5), abo("CONFIRME", 8, 38)])?.type, "ABO_J7");
  });
  it("une chaîne de renouvellements : le rappel porte sur la vraie fin de la chaîne, pas sur la première échéance", () => {
    const r = plan(-90, [abo("CONFIRME", -25, 2), abo("CONFIRME", 2, 4)]);
    assert.equal(r?.type, "ABO_J7"); // fin de chaîne à 4 jours, et non la première échéance à 2 jours (J3)
    assert.equal(r.cle, "2026-11-19");
  });
  it("un abonnement qui vient d'expirer : ABO_FIN, pas ESSAI_FIN", () => {
    const r = plan(-60, [abo("CONFIRME", -33, -1)]);
    assert.equal(r.type, "ABO_FIN");
    assert.equal(r.cle, "2026-11-14");
  });
});

describe("planifierRappel — exclusions", () => {
  it("paiement déjà déclaré et en attente : aucun rappel", () => {
    assert.equal(plan(2, [], { paiementEnAttente: true }), null);
    assert.equal(plan(-60, [abo("CONFIRME", -33, -1)], { paiementEnAttente: true }), null);
  });
  it("abonnement suspendu : aucun rappel", () => assert.equal(plan(-60, [abo("SUSPENDU", -5, 20)]), null));
});

describe("contenuRappel", () => {
  const r = plan(2);
  it("sujet, date en français et lien vers la page Abonnement", () => {
    const c = contenuRappel(r, { prenom: "Awa", lien: "https://app.example/abonnement" });
    assert.match(c.sujet, /3 jours/);
    assert.match(c.html, /17 novembre 2026/);
    assert.match(c.html, /href="https:\/\/app\.example\/abonnement"/);
  });
  it("le prénom est échappé (pas d'injection HTML dans un courriel de la plateforme)", () => {
    const c = contenuRappel(r, { prenom: '<img src=x onerror="alert(1)">', lien: "https://app.example/abonnement" });
    assert.ok(!c.html.includes("<img"));
    assert.match(c.html, /&lt;img/);
  });
  it("le courriel de fin annonce la lecture seule et la conservation des données", () => {
    const fin = contenuRappel(plan(-2), { prenom: null, lien: "https://app.example/abonnement" });
    assert.match(fin.html, /lecture seule/);
    assert.match(fin.html, /aucune de vos données n('|&#39;)est supprimée/i);
    assert.match(fin.html, new RegExp(formatDateFr(jours(-2).getTime() + 7 * J)));
  });
});
