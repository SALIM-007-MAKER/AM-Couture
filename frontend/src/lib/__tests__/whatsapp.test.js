import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { toWhatsAppNumber, waMeLink, buildStatutMessage, buildPretMessage, buildRecuMessage, buildRappelMessage } from "../whatsapp.js";
import { useLocaleStore } from "../../stores/localeStore.js";

afterEach(() => useLocaleStore.setState({ locale: "fr" }));

test("numéro local à 8 chiffres : indicatif Niger ajouté", () => {
  assert.equal(toWhatsAppNumber("89758811"), "22789758811");
});

test("numéro avec espaces ou tirets : nettoyé puis indicatif ajouté", () => {
  assert.equal(toWhatsAppNumber("89 75 88 11"), "22789758811");
  assert.equal(toWhatsAppNumber("89-75-88-11"), "22789758811");
});

test("numéro avec « + » : indicatif déjà saisi, laissé tel quel", () => {
  assert.equal(toWhatsAppNumber("+22789758811"), "22789758811");
  assert.equal(toWhatsAppNumber("+33 6 12 34 56 78"), "33612345678");
});

test("« + » devant 8 chiffres : numéro étranger, l'indicatif Niger n'est PAS ajouté", () => {
  assert.equal(toWhatsAppNumber("+12345678"), "12345678");
});

test("numéro plus long que 8 chiffres sans « + » : laissé tel quel", () => {
  assert.equal(toWhatsAppNumber("22789758811"), "22789758811");
});

test("numéro vide, absent ou sans chiffre : null", () => {
  assert.equal(toWhatsAppNumber(""), null);
  assert.equal(toWhatsAppNumber(null), null);
  assert.equal(toWhatsAppNumber(undefined), null);
  assert.equal(toWhatsAppNumber("abc"), null);
});

test("waMeLink : message encodé ; null si numéro invalide", () => {
  assert.equal(waMeLink("89758811", "Bonjour & merci"), "https://wa.me/22789758811?text=Bonjour%20%26%20merci");
  assert.equal(waMeLink("", "x"), null);
});

const cliente = { prenom: "Aïcha", nom: "Diallo" };
const atelier = { nom: "Atelier Test", devise: "FCFA" };

test("reçu : montants avec devise de l'atelier, nom de l'atelier en signature", () => {
  const m = buildRecuMessage({ commande: { numero: "CMD-001", prixTotal: "50000" }, cliente, atelier, totalPaye: "20000", solde: "30000" });
  assert.match(m, /CMD-001/);
  assert.match(m, /50000 FCFA/);
  assert.match(m, /20000 FCFA/);
  assert.match(m, /30000 FCFA/);
  assert.match(m, /Aïcha Diallo/);
  assert.ok(m.endsWith("— Atelier Test"));
});

test("reçu : devise par défaut FCFA si l'atelier n'en définit pas", () => {
  const m = buildRecuMessage({ commande: { numero: "C1", prixTotal: "100" }, cliente, atelier: { nom: "A" }, totalPaye: "0", solde: "100" });
  assert.match(m, /100 FCFA/);
});

test("statut : la date de livraison prévue est mentionnée tant que la commande est active", () => {
  const commande = { numero: "C1", statut: "EN_CONFECTION", typeVetement: "ROBE", dateLivraisonPrevue: "2026-12-24T00:00:00.000Z" };
  const m = buildStatutMessage({ commande, cliente, atelier, statutLabel: "En confection" });
  assert.match(m, /En confection/);
  assert.match(m, /2026/);
});

test("statut : pas de date de livraison pour une commande livrée ou annulée", () => {
  for (const statut of ["LIVREE", "ANNULEE"]) {
    const commande = { numero: "C1", statut, typeVetement: "ROBE", dateLivraisonPrevue: "2026-12-24T00:00:00.000Z" };
    const avec = buildStatutMessage({ commande: { ...commande, statut: "NOUVELLE" }, cliente, atelier, statutLabel: "x" });
    const sans = buildStatutMessage({ commande, cliente, atelier, statutLabel: "x" });
    assert.ok(sans.split("\n").length < avec.split("\n").length, `${statut} : une ligne de moins attendue`);
  }
});

test("statut : sans atelier, repli sur le libellé générique (jamais « undefined »)", () => {
  const commande = { numero: "C1", statut: "NOUVELLE", typeVetement: "ROBE", dateLivraisonPrevue: "2026-12-24T00:00:00.000Z" };
  assert.doesNotMatch(buildStatutMessage({ commande, cliente, atelier: null, statutLabel: "x" }), /undefined|null/);
  assert.doesNotMatch(buildPretMessage({ cliente, atelier: null }), /undefined|null/);
});

test("rappel : la commande prête a priorité sur le solde", () => {
  const prete = buildRappelMessage({ cliente, atelier, commandePrete: { numero: "C9" }, totalRestant: "5000" });
  assert.match(prete, /C9/);
  assert.doesNotMatch(prete, /5000/);
  const solde = buildRappelMessage({ cliente, atelier, commandePrete: null, totalRestant: "5000", devise: "XOF" });
  assert.match(solde, /5000 XOF/);
});

test("les messages suivent la langue de l'interface", () => {
  const cmd = { numero: "C1", prixTotal: "10" };
  const fr = buildRecuMessage({ commande: cmd, cliente, atelier, totalPaye: "0", solde: "10" });
  useLocaleStore.setState({ locale: "en" });
  const en = buildRecuMessage({ commande: cmd, cliente, atelier, totalPaye: "0", solde: "10" });
  assert.notEqual(fr, en);
});
