import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bilanAteliers,
  revenuMensuelRecurrent,
  moisDeLaFenetre,
  serieRevenus,
  totauxRevenus,
  renouvellementsASuivre,
  tauxRenouvellement,
  bilanConversion,
} from "../commerce.js";

const J = 86_400_000;
const NOW = new Date("2026-11-15T12:00:00Z");
const jours = (n) => new Date(NOW.getTime() + n * J);
const abo = (debutJ, finJ, extra = {}) => ({
  statut: "CONFIRME",
  planNom: "Pro",
  dureeMois: 1,
  prix: "10000",
  dateDebut: jours(debutJ),
  dateExpiration: jours(finJ),
  ...extra,
});
const atelier = (id, trialJ, abonnements = [], extra = {}) => ({
  id,
  nom: `Atelier ${id}`,
  actif: true,
  trialEndsAt: trialJ === null ? null : jours(trialJ),
  abonnements,
  ...extra,
});
const GRACE = { joursGrace: 7 };

describe("bilanAteliers", () => {
  const ateliers = [
    atelier("essai", 5),
    atelier("actif", -60, [abo(-5, 25)]),
    atelier("grace", -3),
    atelier("lectureSeule", -40),
    atelier("ancien", null),
    atelier("suspenduAbo", -60, [abo(-5, 25, { statut: "SUSPENDU" })]),
    atelier("planifie", -60, [abo(5, 35)]),
    atelier("suspendu", 5, [], { actif: false }),
  ];
  const b = bilanAteliers(ateliers, GRACE, NOW);

  it("compte les ateliers actifs par état d'abonnement", () => {
    assert.deepEqual(b.parEtat, { ACTIF: 1, ESSAI: 1, EN_ATTENTE: 1, EXPIRE: 2, SUSPENDU: 1, AUCUN: 1 });
  });
  it("compte les ateliers par mode d'accès", () => {
    // complet : essai, abonnement actif, atelier ancien ; grâce : essai terminé depuis 3 jours ;
    // lecture seule : essai terminé depuis 40 jours, abonnement suspendu, abonnement planifié pas encore commencé.
    assert.equal(b.parAcces.COMPLET, 3);
    assert.equal(b.parAcces.GRACE, 1);
    assert.equal(b.parAcces.LECTURE_SEULE, 3);
  });
  it("les ateliers suspendus par la plateforme sont comptés à part, hors des états", () => {
    assert.equal(b.total, 8);
    assert.equal(b.actifs, 7);
    assert.equal(b.suspendus, 1);
    assert.equal(Object.values(b.parEtat).reduce((x, y) => x + y, 0), 7);
  });
});

describe("revenuMensuelRecurrent", () => {
  it("somme prix ÷ durée des seuls abonnements ACTIFS", () => {
    const abonnements = [
      abo(-5, 25, { prix: "10000", dureeMois: 1 }),
      abo(-5, 85, { prix: "27000", dureeMois: 3 }), // 9 000 / mois
      abo(-60, -30, { prix: "50000", dureeMois: 1 }), // échu
      abo(5, 35, { prix: "50000", dureeMois: 1 }), // pas commencé
      abo(-5, 25, { prix: "50000", dureeMois: 1, statut: "SUSPENDU" }),
      abo(-5, 25, { prix: "50000", dureeMois: 1, statut: "ANNULE" }),
    ];
    assert.equal(revenuMensuelRecurrent(abonnements, NOW).toString(), "19000");
  });
  it("arrondit à 2 décimales et ignore une durée absente ou nulle", () => {
    assert.equal(revenuMensuelRecurrent([abo(-1, 60, { prix: "10000", dureeMois: 3 })], NOW).toString(), "3333.33");
    assert.equal(revenuMensuelRecurrent([abo(-1, 60, { dureeMois: null }), abo(-1, 60, { dureeMois: 0 })], NOW).toString(), "0");
  });
});

describe("séries mensuelles", () => {
  it("fenêtre de mois UTC, du plus ancien au courant, à cheval sur deux années", () => {
    assert.deepEqual(moisDeLaFenetre(4, new Date("2027-01-10T00:00:00Z")), ["2026-10", "2026-11", "2026-12", "2027-01"]);
    assert.deepEqual(moisDeLaFenetre(1, NOW), ["2026-11"]);
  });
  it("les mois sans mouvement sont présents à zéro ; net = encaissé − remboursé", () => {
    const serie = serieRevenus(
      [{ mois: "2026-09", total: "27000", nombre: 2 }, { mois: "2026-11", total: "10000.50", nombre: 1 }],
      [{ mois: "2026-11", total: "10000.50", nombre: 1 }],
      3,
      NOW,
    );
    assert.deepEqual(serie.map((s) => s.mois), ["2026-09", "2026-10", "2026-11"]);
    assert.equal(serie[1].encaisse, "0");
    assert.equal(serie[1].net, "0");
    assert.equal(serie[2].net, "0");
    assert.equal(serie[0].net, "27000");
    assert.equal(serie[2].nombreRemboursements, 1);
  });
  it("les totaux additionnent sans erreur de flottant", () => {
    const serie = serieRevenus([{ mois: "2026-10", total: "0.1", nombre: 1 }, { mois: "2026-11", total: "0.2", nombre: 1 }], [], 2, NOW);
    assert.equal(totauxRevenus(serie).encaisse, "0.3");
  });
});

describe("renouvellementsASuivre", () => {
  const ateliers = [
    atelier("bientot", -60, [abo(-25, 5)]),
    atelier("renouvele", -60, [abo(-25, 5), abo(5, 35)]),
    atelier("lointain", -60, [abo(-5, 90)]),
    atelier("essaiFin", 3),
    atelier("essaiLointain", 12),
    atelier("expireRecent", -90, [abo(-40, -10)]),
    atelier("expireAncien", -400, [abo(-300, -200)]),
    atelier("essaiTermine", -5),
    atelier("suspendu", 3, [], { actif: false }),
    atelier("attente", -60, [abo(-25, 3)], { paiementEnAttente: true }),
  ];
  const r = renouvellementsASuivre(ateliers, { horizonJours: 30, ...GRACE }, NOW);
  const ids = (liste) => liste.map((x) => x.atelierId);

  it("à renouveler : échéance de la chaîne dans l'horizon, plus proche d'abord ; un renouvellement planifié la repousse", () => {
    assert.deepEqual(ids(r.aRenouveler), ["attente", "bientot"]); // échéances à 3 et 5 jours
    assert.equal(r.aRenouveler.find((x) => x.atelierId === "bientot").joursRestants, 5);
  });
  it("le renouvellement planifié (fin à 35 jours) sort de la liste à 30 jours", () => {
    assert.ok(!ids(r.aRenouveler).includes("renouvele"));
    const large = renouvellementsASuivre(ateliers, { horizonJours: 40, ...GRACE }, NOW);
    assert.ok(ids(large.aRenouveler).includes("renouvele"));
  });
  it("signale qu'un paiement est déjà déclaré", () => {
    assert.equal(r.aRenouveler.find((x) => x.atelierId === "attente").paiementEnAttente, true);
    assert.equal(r.aRenouveler.find((x) => x.atelierId === "bientot").paiementEnAttente, false);
  });
  it("essais qui finissent dans l'horizon", () => {
    assert.deepEqual(ids(r.essaisQuiFinissent), ["essaiFin", "essaiLointain"]);
    const court = renouvellementsASuivre(ateliers, { horizonJours: 7, ...GRACE }, NOW);
    assert.deepEqual(ids(court.essaisQuiFinissent), ["essaiFin"]);
  });
  it("récemment expirés : anciens abonnés seulement, dans les 30 jours, avec leur mode d'accès", () => {
    assert.deepEqual(ids(r.recemmentExpires), ["expireRecent"]);
    assert.equal(r.recemmentExpires[0].joursDepuis, 10);
    assert.equal(r.recemmentExpires[0].acces, "LECTURE_SEULE");
  });
  it("les ateliers suspendus par la plateforme et les essais déjà terminés n'apparaissent nulle part", () => {
    const tous = [...r.aRenouveler, ...r.recemmentExpires, ...r.essaisQuiFinissent].map((x) => x.atelierId);
    assert.ok(!tous.includes("suspendu"));
    assert.ok(!tous.includes("essaiTermine"));
    assert.ok(!tous.includes("expireAncien"));
  });
});

describe("tauxRenouvellement", () => {
  it("renouvelé = suivi d'un abonnement qui commence à l'échéance (à un jour près) ou dans la grâce", () => {
    const ateliers = [
      atelier("a", -300, [abo(-60, -30), abo(-30, 0)]), // renouvelé pile ; le second finit à NOW : exclu de la période
      atelier("b", -300, [abo(-60, -30), abo(-25, 5)]), // renouvelé 5 jours après : dans la grâce de 7
      atelier("c", -300, [abo(-60, -30), abo(-10, 20)]), // 20 jours après : trop tard
      atelier("d", -300, [abo(-60, -30)]), // jamais renouvelé
    ];
    const r = tauxRenouvellement(ateliers, { periodeJours: 90, ...GRACE }, NOW);
    assert.equal(r.echus, 4 + 0); // a:1 (le premier), b:1, c:1, d:1 ; les seconds de a et b ne sont pas échus
    assert.equal(r.renouveles, 2);
    assert.equal(r.taux, 50);
  });
  it("aucune échéance sur la période : taux nul (null), pas de division par zéro", () => {
    assert.equal(tauxRenouvellement([atelier("a", -300, [abo(-5, 25)])], { periodeJours: 90, ...GRACE }, NOW).taux, null);
  });
  it("un abonnement échu plus tôt que la période n'est pas compté", () => {
    assert.equal(tauxRenouvellement([atelier("a", -300, [abo(-300, -200)])], { periodeJours: 90, ...GRACE }, NOW).echus, 0);
  });
});

describe("bilanConversion", () => {
  it("part des essais terminés sur la période qui ont un abonnement (même suspendu)", () => {
    const ateliers = [
      atelier("converti", -30, [abo(-35, -5)]),
      atelier("suspendu", -30, [abo(-35, 5, { statut: "SUSPENDU" })]),
      atelier("perdu", -30),
      atelier("annule", -30, [abo(-35, -5, { statut: "ANNULE" })]),
      atelier("hors", -200, [abo(-200, -150)]), // essai terminé hors période
      atelier("enCours", 5), // essai pas terminé
      atelier("ancien", null),
    ];
    const r = bilanConversion(ateliers, { periodeJours: 90 }, NOW);
    assert.equal(r.essaisTermines, 4);
    assert.equal(r.convertis, 2);
    assert.equal(r.taux, 50);
  });
  it("aucun essai terminé : taux null", () => {
    assert.equal(bilanConversion([atelier("a", 5)], { periodeJours: 90 }, NOW).taux, null);
  });
});
