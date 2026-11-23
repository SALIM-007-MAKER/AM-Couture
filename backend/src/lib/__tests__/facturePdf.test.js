import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Writable } from "node:stream";
import { formaterMontant, lignesFacture, streamFacturePdf } from "../facturePdf.js";
import { LOGO_TAILORA_PNG } from "../logoTailora.js";

const FACTURE = {
  numero: "FAC-2026-0001",
  atelierNom: "AM Couture",
  planNom: "TARIFICATION",
  dureeMois: 1,
  periodeDebut: new Date("2026-11-23"),
  periodeFin: new Date("2026-12-23"),
  montant: "5000",
  devise: "FCFA",
  moyenPaiement: "ESPECES",
  referencePaiement: "REF1",
  emisLe: new Date("2026-11-23"),
};

/** Génère le PDF dans un tampon mémoire (res factice : seul setHeader et le flux d'écriture sont utilisés). */
function genererPdf(facture) {
  return new Promise((resolve, reject) => {
    const morceaux = [];
    const res = new Writable({
      write(chunk, _enc, cb) {
        morceaux.push(chunk);
        cb();
      },
    });
    res.setHeader = () => {};
    res.on("finish", () => resolve(Buffer.concat(morceaux)));
    res.on("error", reject);
    streamFacturePdf(res, { facture });
  });
}

test("formaterMontant : séparateur de milliers (espace ordinaire), décimales seulement si non nulles", () => {
  assert.equal(formaterMontant("5000"), "5 000");
  assert.equal(formaterMontant("999"), "999");
  assert.equal(formaterMontant("0"), "0");
  assert.equal(formaterMontant("1000.00"), "1 000");
  assert.equal(formaterMontant("1250000.5"), "1 250 000,50");
  assert.equal(formaterMontant(12500), "12 500");
  assert.ok(!formaterMontant("1234567").includes(" "), "pas d'espace fine : absente de WinAnsi, elle s'afficherait mal dans le PDF");
});

test("lignesFacture : la référence n'apparaît que si elle existe", () => {
  const base = { atelierNom: "A", planNom: "P", dureeMois: 1, moyenPaiement: "ESPECES" };
  assert.ok(!lignesFacture(base).some(([l]) => l === "Référence du paiement"));
  assert.ok(lignesFacture({ ...base, referencePaiement: "R1" }).some(([l, v]) => l === "Référence du paiement" && v === "R1"));
});

test("le logo intégré au code est identique à celui du frontend (à régénérer si le logo change)", () => {
  const fichier = readFileSync(new URL("../../../../frontend/public/logo-tailora.png", import.meta.url));
  assert.ok(LOGO_TAILORA_PNG.equals(fichier));
  assert.equal(LOGO_TAILORA_PNG.subarray(1, 4).toString(), "PNG");
});

test("le PDF de facture contient l'image du logo, sur une seule page, annulée ou non", async () => {
  for (const facture of [FACTURE, { ...FACTURE, annuleeLe: new Date("2026-12-01"), annuleeMotif: "Remboursement" }]) {
    const pdf = (await genererPdf(facture)).toString("latin1");
    assert.ok(pdf.startsWith("%PDF"));
    assert.ok(pdf.includes("/Subtype /Image"), "le logo est dans le PDF");
    assert.equal((pdf.match(/\/Type \/Page\b/g) ?? []).length, 1, "une seule page");
  }
});
