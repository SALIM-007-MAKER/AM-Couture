import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MOYENS_PAIEMENT,
  validerDeclaration,
  corpsDeclaration,
  nouvelleCleIdempotence,
  bandeauAcces,
  peutDeclarer,
  retourPaiement,
  styleTransaction,
} from "../paiement.js";

test("Wave n'est pas un moyen déclarable (il passe par son propre parcours)", () => {
  assert.ok(!MOYENS_PAIEMENT.includes("WAVE"));
});

test("validerDeclaration : la référence est obligatoire sauf pour des espèces", () => {
  assert.deepEqual(validerDeclaration({ moyenPaiement: "MOBILE_MONEY", reference: "", dureeMois: 3 }), { reference: "subPay.errReference" });
  assert.deepEqual(validerDeclaration({ moyenPaiement: "MOBILE_MONEY", reference: "ab", dureeMois: 3 }), { reference: "subPay.errReference" });
  assert.deepEqual(validerDeclaration({ moyenPaiement: "MOBILE_MONEY", reference: "  AIR-1 ", dureeMois: 3 }), {});
  assert.deepEqual(validerDeclaration({ moyenPaiement: "ESPECES", reference: "", dureeMois: 1 }), {});
});

test("validerDeclaration : moyen inconnu ou durée invalide", () => {
  assert.equal(validerDeclaration({ moyenPaiement: "WAVE", reference: "abc", dureeMois: 1 }).moyenPaiement, "subPay.errMoyen");
  assert.equal(validerDeclaration({ moyenPaiement: "VIREMENT", reference: "abc", dureeMois: 0 }).dureeMois, "subPay.errDuree");
  assert.equal(validerDeclaration({ moyenPaiement: "VIREMENT", reference: "abc", dureeMois: 1.5 }).dureeMois, "subPay.errDuree");
});

test("corpsDeclaration : champs vides retirés, espaces supprimés, jamais de montant", () => {
  const corps = corpsDeclaration({
    planId: "p1",
    dureeMois: 3,
    moyenPaiement: "MOBILE_MONEY",
    operateur: " Airtel Money ",
    reference: " AIR-1 ",
    preuveNote: "",
    montant: "1",
  });
  assert.deepEqual(corps, { planId: "p1", dureeMois: 3, moyenPaiement: "MOBILE_MONEY", operateur: "Airtel Money", reference: "AIR-1" });
  assert.ok(!("montant" in corps));
});

test("corpsDeclaration : l'opérateur n'est envoyé que pour le mobile money", () => {
  const corps = corpsDeclaration({ planId: "p1", dureeMois: 1, moyenPaiement: "VIREMENT", operateur: "Banque X", reference: "VIR-9" });
  assert.ok(!("operateur" in corps));
});

test("nouvelleCleIdempotence : 8 à 128 caractères autorisés, différente à chaque appel", () => {
  const a = nouvelleCleIdempotence();
  const b = nouvelleCleIdempotence();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9\-_.:]{8,128}$/);
  assert.equal(nouvelleCleIdempotence(() => "fixe"), "souscription-fixe");
});

test("bandeauAcces : rien en accès complet ni sans information", () => {
  assert.equal(bandeauAcces(null), null);
  assert.equal(bandeauAcces({}), null);
  assert.equal(bandeauAcces({ acces: { mode: "COMPLET" } }), null);
});

test("bandeauAcces : grâce, lecture seule, suspension", () => {
  const fin = "2026-11-22T12:00:00.000Z";
  assert.deepEqual(bandeauAcces({ statut: "EXPIRE", acces: { mode: "GRACE", joursGraceRestants: 4, graceJusquAu: fin } }), {
    type: "GRACE",
    jours: 4,
    date: fin,
  });
  assert.equal(bandeauAcces({ statut: "EXPIRE", acces: { mode: "LECTURE_SEULE", graceJusquAu: fin } }).type, "LECTURE_SEULE");
  assert.equal(bandeauAcces({ statut: "SUSPENDU", acces: { mode: "LECTURE_SEULE", graceJusquAu: null } }).type, "SUSPENDU");
});

test("peutDeclarer : refusé tant qu'un paiement est en attente ou sans données", () => {
  assert.equal(peutDeclarer(null), false);
  assert.equal(peutDeclarer({ paiementEnAttente: { numero: "TRX-1" } }), false);
  assert.equal(peutDeclarer({ paiementEnAttente: null }), true);
});

test("retourPaiement : lit le retour de Wave, ignore tout ce qui est douteux", () => {
  assert.deepEqual(retourPaiement("?paiement=retour&transaction=TRX-2026-0001"), { resultat: "retour", transaction: "TRX-2026-0001" });
  assert.deepEqual(retourPaiement("?paiement=echec&transaction=TRX-2026-0001"), { resultat: "echec", transaction: "TRX-2026-0001" });
  assert.equal(retourPaiement(""), null);
  assert.equal(retourPaiement("?paiement=succes&transaction=TRX-1"), null);
  assert.equal(retourPaiement("?paiement=retour"), null);
  assert.equal(retourPaiement(`?paiement=retour&transaction=${"x".repeat(41)}`), null);
});

test("styleTransaction : un statut inconnu garde un style neutre", () => {
  assert.equal(styleTransaction("N_IMPORTE_QUOI"), styleTransaction("ANNULEE"));
  assert.notEqual(styleTransaction("REUSSIE"), styleTransaction("ECHOUEE"));
});
