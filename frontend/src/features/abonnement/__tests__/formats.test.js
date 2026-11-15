import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { formatPrix, formatDateFr, lienWhatsapp } from "../constants.js";
import { formatDateAbonnement } from "../../ateliers/dates.js";
import { useLocaleStore } from "../../../stores/localeStore.js";

afterEach(() => useLocaleStore.setState({ locale: "fr" }));

test("formatPrix : accepte nombre ou chaîne (les montants arrivent en chaîne depuis l'API)", () => {
  const norm = (s) => s.replace(/\s/g, "");
  assert.equal(norm(formatPrix("15000")), "15000");
  assert.equal(norm(formatPrix(15000)), "15000");
});

test("formatPrix : au plus 2 décimales", () => {
  assert.equal(formatPrix("10.456").replace(/\s/g, "").replace(",", "."), "10.46");
});

test("formatPrix : séparateur décimal selon la langue", () => {
  assert.match(formatPrix("1.5"), /1,5/);
  useLocaleStore.setState({ locale: "en" });
  assert.match(formatPrix("1.5"), /1\.5/);
});

test("formatDateFr : mois en toutes lettres, dépend de la langue", () => {
  const iso = "2026-12-24T12:00:00.000Z";
  assert.match(formatDateFr(iso), /décembre/);
  useLocaleStore.setState({ locale: "en" });
  assert.match(formatDateFr(iso), /December/);
});

test("formatDateAbonnement : tiret si date absente", () => {
  assert.equal(formatDateAbonnement(null), "—");
  assert.equal(formatDateAbonnement(undefined), "—");
  assert.match(formatDateAbonnement("2026-12-24T12:00:00.000Z"), /2026/);
});

test("lienWhatsapp : message encodé", () => {
  assert.equal(lienWhatsapp("22789758811", "Bonjour & merci"), "https://wa.me/22789758811?text=Bonjour%20%26%20merci");
});
