import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Stock traçable : une sortie exige un motif, un mouvement garde son origine et son auteur, le stock ne devient jamais
// négatif, et la quantité est déduite des mouvements (jamais saisie à la main). Couvre aussi l'interface du formulaire.
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

let articleId;
const quantite = async (request) => Number((await (await request.get(`/api/stock/${articleId}`)).json()).quantite);

test("préparation : un article avec 10 mètres en stock initial", async ({ request }) => {
  const res = await request.post("/api/stock", { data: { nom: "Satin traçable E2E", unite: "METRE", quantiteInitiale: "10" } });
  expect(res.status(), await res.text()).toBe(201);
  articleId = (await res.json()).id;
  expect(await quantite(request)).toBe(10);
});

test("sortie sans motif : refusée par le formulaire et par l'API, stock inchangé", async ({ page, request }) => {
  await page.goto(`/stock/${articleId}`);
  await page.getByLabel("Mouvement").selectOption("SORTIE");
  await page.getByLabel(/^Quantité/).fill("2");
  await page.getByRole("button", { name: "Enregistrer la sortie" }).click();
  // Le champ « Motif » est obligatoire : le navigateur bloque l'envoi.
  const valueMissing = await page.getByLabel(/^Motif/).evaluate((el) => el.validity.valueMissing);
  expect(valueMissing).toBe(true);
  expect(await quantite(request)).toBe(10);

  const api = await request.post(`/api/stock/${articleId}/mouvements`, {
    data: { type: "SORTIE", quantite: "2" },
    headers: { "Idempotency-Key": `e2e-sans-motif-${Date.now()}` },
  });
  expect(api.status()).toBe(400);
  expect(await quantite(request)).toBe(10);
});

test("sortie avec motif : enregistrée, le stock baisse, l'historique montre le motif, l'origine et l'auteur", async ({ page, request }) => {
  await page.goto(`/stock/${articleId}`);
  await page.getByLabel("Mouvement").selectOption("SORTIE");
  await page.getByLabel(/^Quantité/).fill("3");
  await page.getByLabel(/^Motif/).fill("Robe de Mme Diop");
  await page.getByRole("button", { name: "Enregistrer la sortie" }).click();
  await expect(page.getByText("Robe de Mme Diop")).toBeVisible();
  await expect(page.getByText(/Saisie manuelle · par e2e-pdg-alpha/)).toBeVisible();
  await expect(page.getByText("Stock initial").first()).toBeVisible();
  expect(await quantite(request)).toBe(7);
});

test("un double envoi du même mouvement n'en crée qu'un (clé d'opération)", async ({ request }) => {
  const cle = `e2e-double-${Date.now()}`;
  const corps = { type: "SORTIE", quantite: "1", motif: "Double clic" };
  const [a, b] = await Promise.all([
    request.post(`/api/stock/${articleId}/mouvements`, { data: corps, headers: { "Idempotency-Key": cle } }),
    request.post(`/api/stock/${articleId}/mouvements`, { data: corps, headers: { "Idempotency-Key": cle } }),
  ]);
  expect([a.status(), b.status()].every((s) => s === 200 || s === 201 || s === 409)).toBe(true);
  expect(await quantite(request)).toBe(6);
});

test("le stock ne peut pas devenir négatif : message métier, rien d'enregistré", async ({ page, request }) => {
  await page.goto(`/stock/${articleId}`);
  await page.getByLabel("Mouvement").selectOption("SORTIE");
  await page.getByLabel(/^Quantité/).fill("500");
  await page.getByLabel(/^Motif/).fill("Trop grand");
  await page.getByRole("button", { name: "Enregistrer la sortie" }).click();
  await expect(page.getByText("Quantité insuffisante en stock.")).toBeVisible();
  expect(await quantite(request)).toBe(6);
});

test("entrée : enregistrée et ajoutée au stock", async ({ page, request }) => {
  await page.goto(`/stock/${articleId}`);
  await page.getByLabel(/^Quantité/).fill("4");
  await page.getByRole("button", { name: "Enregistrer l'entrée" }).click();
  await expect.poll(() => quantite(request)).toBe(10);
});
