import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RESSOURCES,
  normaliserLimites,
  limitesEffectives,
  plancherInitial,
  planchersFusionnes,
  estEligiblePlancher,
  figerLimites,
  limitesApplicables,
  etatJauge,
  peutAjouter,
  jauges,
} from "../quotas.js";

const JOUR = 86_400_000;
const MAINTENANT = new Date("2026-11-19T12:00:00Z");
const jours = (n) => new Date(MAINTENANT.getTime() + n * JOUR);
const STARTER = { clientes: 100, employes: 1, commandesActives: 50, modeles: 50 };
const PRO = { clientes: 500, employes: 5, commandesActives: 250, modeles: 250 };

test("normaliserLimites : clés connues, entiers de 1 à 1 000 000 ; le reste est ignoré (donc illimité)", () => {
  assert.deepEqual(normaliserLimites({ clientes: 100, modeles: 0, employes: -1, commandesActives: 1.5, inconnue: 5 }), { clientes: 100 });
  assert.deepEqual(normaliserLimites({ clientes: 1_000_000 }), { clientes: 1_000_000 });
  assert.deepEqual(normaliserLimites({ clientes: 1_000_001 }), {});
  assert.deepEqual(normaliserLimites(null), {});
  assert.deepEqual(normaliserLimites([1, 2]), {});
  assert.deepEqual(normaliserLimites("x"), {});
  assert.deepEqual(RESSOURCES, ["clientes", "employes", "commandesActives", "modeles"]);
});

test("limite effective = max(formule, plancher), pour les seules ressources limitées par la formule", () => {
  assert.deepEqual(limitesEffectives(STARTER, { clientes: 140 }), { ...STARTER, clientes: 140 });
  assert.deepEqual(limitesEffectives(PRO, { clientes: 140 }), PRO, "plancher inférieur à la formule : sans effet");
  assert.deepEqual(limitesEffectives({}, { clientes: 140 }), {}, "formule illimitée : le plancher n'invente pas de limite");
  assert.deepEqual(limitesEffectives({ clientes: 100 }, { modeles: 80 }), { clientes: 100 });
});

test("plancherInitial : seulement les ressources dont l'usage dépasse la limite de la formule", () => {
  assert.deepEqual(plancherInitial(STARTER, { clientes: 140, employes: 1, commandesActives: 10, modeles: 51 }), { clientes: 140, modeles: 51 });
  assert.deepEqual(plancherInitial(STARTER, { clientes: 100, employes: 1, commandesActives: 50, modeles: 50 }), {}, "usage égal à la limite : pas de plancher");
  assert.deepEqual(plancherInitial({ clientes: 100 }, { clientes: 3_000_000 }), { clientes: 1_000_000 }, "plafonné à la borne");
  assert.deepEqual(plancherInitial({}, { clientes: 999 }), {});
});

test("éligibilité au plancher : atelier ancien, jamais activé ; pas pour un atelier qui a eu l'essai", () => {
  assert.equal(estEligiblePlancher({ trialEndsAt: null }, []), true);
  assert.equal(estEligiblePlancher({ trialEndsAt: null }, [{ dateDebut: null }]), true, "déclaration jamais activée : toujours éligible");
  assert.equal(estEligiblePlancher({ trialEndsAt: null }, [{ dateDebut: jours(-400) }]), false, "a déjà eu un abonnement activé, même échu");
  assert.equal(estEligiblePlancher({ trialEndsAt: jours(-30) }, []), false, "atelier passé par l'essai : quotas stricts");
  assert.equal(estEligiblePlancher({ trialEndsAt: jours(5) }, []), false);
});

test("figerLimites : exemple Starter / 140 clientes, renouvellements, changements de formule (le plancher se conserve)", () => {
  const ancien = { trialEndsAt: null };
  const usages = { clientes: 140, employes: 1, commandesActives: 12, modeles: 20 };

  // 1. première souscription Starter à 140 clientes : limite effective 140, plancher enregistré
  const a1 = figerLimites({ limitesFormule: STARTER, atelier: ancien, autres: [], usages });
  assert.deepEqual(a1.plancher, { clientes: 140 });
  assert.equal(a1.limites.clientes, 140);
  assert.equal(a1.limites.employes, 1);

  const precedent = (r) => ({ dateDebut: jours(-30), plancher: r.plancher });
  // 2. renouvellement Starter : plancher reporté, jamais recalculé (même si l'usage a changé)
  const a2 = figerLimites({ limitesFormule: STARTER, atelier: ancien, autres: [precedent(a1)], usages: { clientes: 999 } });
  assert.deepEqual(a2.plancher, { clientes: 140 });
  assert.equal(a2.limites.clientes, 140);
  // 3. correction vers Professionnel : limite effective 500, plancher conservé (inactif)
  const a3 = figerLimites({ limitesFormule: PRO, atelier: ancien, autres: [precedent(a1)] });
  assert.equal(a3.limites.clientes, 500);
  assert.deepEqual(a3.plancher, { clientes: 140 }, "le plancher reste conservé même inférieur à la limite de la formule");
  // 4. retour vers Starter : 140 de nouveau
  const a4 = figerLimites({ limitesFormule: STARTER, atelier: ancien, autres: [precedent(a3)] });
  assert.equal(a4.limites.clientes, 140);
  // 5. Premium (aucune limite) puis retour : le plancher traverse la formule illimitée
  const a5 = figerLimites({ limitesFormule: {}, atelier: ancien, autres: [precedent(a4)] });
  assert.deepEqual(a5.limites, {});
  assert.deepEqual(a5.plancher, { clientes: 140 });
  assert.equal(figerLimites({ limitesFormule: STARTER, atelier: ancien, autres: [precedent(a5)] }).limites.clientes, 140);
});

test("figerLimites : un atelier passé par l'essai n'a aucun plancher (quotas stricts)", () => {
  const apresEssai = { trialEndsAt: jours(-20) };
  const r = figerLimites({ limitesFormule: STARTER, atelier: apresEssai, autres: [], usages: { clientes: 300 } });
  assert.deepEqual(r.plancher, {});
  assert.deepEqual(r.limites, STARTER);
});

test("figerLimites : usage sous les limites, ou aucune limite : aucun plancher", () => {
  const r = figerLimites({ limitesFormule: STARTER, atelier: { trialEndsAt: null }, autres: [], usages: { clientes: 10, employes: 0, commandesActives: 0, modeles: 0 } });
  assert.deepEqual(r.plancher, {});
  assert.deepEqual(r.limites, STARTER);
  assert.deepEqual(figerLimites({ limitesFormule: {}, atelier: { trialEndsAt: null }, autres: [], usages: { clientes: 500 } }), { limites: {}, plancher: {} });
});

test("planchersFusionnes : le plus élevé par ressource", () => {
  assert.deepEqual(planchersFusionnes([{ plancher: { clientes: 140 } }, { plancher: { clientes: 150, modeles: 60 } }, { plancher: {} }]), { clientes: 150, modeles: 60 });
  assert.deepEqual(planchersFusionnes([]), {});
});

// ── Limites en vigueur ─────────────────────────────────────────────────────────────────────────────────────────────
const abo = (statut, debut, fin, limites = STARTER) => ({ statut, dateDebut: jours(debut), dateExpiration: jours(fin), limites });

test("essai en cours : aucun quota, même avec un abonnement déjà actif", () => {
  const r = limitesApplicables({ trialEndsAt: jours(5) }, [abo("CONFIRME", -1, 29)], MAINTENANT);
  assert.deepEqual(r, { limites: null, raison: "ESSAI" });
});

test("après l'essai, l'abonnement actif s'applique (quotas stricts)", () => {
  const r = limitesApplicables({ trialEndsAt: jours(-2) }, [abo("CONFIRME", -10, 20)], MAINTENANT);
  assert.equal(r.raison, "ABONNEMENT");
  assert.deepEqual(r.limites, STARTER);
});

test("atelier ancien (sans essai) : aucun quota sans abonnement, ceux de l'abonnement actif sinon", () => {
  assert.deepEqual(limitesApplicables({ trialEndsAt: null }, [], MAINTENANT), { limites: null, raison: "AUCUN" });
  assert.equal(limitesApplicables({ trialEndsAt: null }, [abo("CONFIRME", -1, 29, PRO)], MAINTENANT).limites.clientes, 500);
});

test("abonnement existant migré avec des limites {} : illimité", () => {
  const r = limitesApplicables({ trialEndsAt: null }, [abo("CONFIRME", -10, 20, {})], MAINTENANT);
  assert.equal(r.raison, "ABONNEMENT");
  assert.deepEqual(r.limites, {});
  assert.equal(etatJauge(10_000, r.limites.clientes ?? null), "illimite");
});

test("renouvellement planifié : l'abonnement actif d'abord, le suivant prend le relais à sa date de début", () => {
  const actuel = abo("CONFIRME", -10, 20, STARTER);
  const suivant = abo("CONFIRME", 20, 50, PRO);
  assert.equal(limitesApplicables({ trialEndsAt: null }, [actuel, suivant], MAINTENANT).limites.clientes, 100);
  assert.equal(limitesApplicables({ trialEndsAt: null }, [actuel, suivant], jours(21)).limites.clientes, 500);
});

test("période de grâce : limites du DERNIER abonnement échu ; sans abonnement, aucun quota", () => {
  const ancien = abo("CONFIRME", -100, -40, PRO);
  const dernier = abo("CONFIRME", -40, -3, STARTER);
  const r = limitesApplicables({ trialEndsAt: jours(-200) }, [ancien, dernier], MAINTENANT);
  assert.equal(r.raison, "GRACE");
  assert.deepEqual(r.limites, STARTER);
  assert.deepEqual(limitesApplicables({ trialEndsAt: jours(-3) }, [], MAINTENANT), { limites: null, raison: "AUCUN" }, "grâce après essai, sans abonnement");
});

test("suspension : limites de l'abonnement suspendu ; abonnement annulé ou non confirmé : ignorés", () => {
  const suspendu = abo("SUSPENDU", -10, 20, STARTER);
  assert.equal(limitesApplicables({ trialEndsAt: null }, [suspendu], MAINTENANT).raison, "SUSPENDU");
  assert.equal(limitesApplicables({ trialEndsAt: null }, [abo("ANNULE", -10, 20), abo("EN_ATTENTE", -1, 20)], MAINTENANT).raison, "AUCUN");
});

test("limites illisibles en base : ignorées (illimité) plutôt que de bloquer l'atelier", () => {
  const r = limitesApplicables({ trialEndsAt: null }, [abo("CONFIRME", -1, 29, { clientes: "beaucoup", modeles: 0 })], MAINTENANT);
  assert.deepEqual(r.limites, {});
});

test("états de jauge et possibilité d'ajout", () => {
  assert.equal(etatJauge(5, null), "illimite");
  assert.equal(etatJauge(79, 100), "ok");
  assert.equal(etatJauge(80, 100), "proche");
  assert.equal(etatJauge(99, 100), "proche");
  assert.equal(etatJauge(100, 100), "atteint");
  assert.equal(etatJauge(140, 100), "depasse");
  assert.equal(peutAjouter(99, 100), true);
  assert.equal(peutAjouter(100, 100), false);
  assert.equal(peutAjouter(140, 100), false);
  assert.equal(peutAjouter(10_000, null), true);
  assert.equal(peutAjouter(95, 100, 5), true);
  assert.equal(peutAjouter(96, 100, 5), false);
});

test("jauges : quatre ressources, limite nulle = illimitée, plancher signalé", () => {
  const j = jauges({ clientes: 140, employes: 1, commandesActives: 3, modeles: 0 }, { clientes: 140, employes: 1 }, { clientes: 140 });
  assert.deepEqual(j.map((x) => x.cle), RESSOURCES);
  assert.deepEqual(j[0], { cle: "clientes", usage: 140, limite: 140, etat: "atteint", plancherApplique: true });
  assert.equal(j[1].etat, "atteint");
  assert.equal(j[1].plancherApplique, false);
  assert.equal(j[2].limite, null);
  assert.equal(j[2].etat, "illimite");
});
