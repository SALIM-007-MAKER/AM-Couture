import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Lookbook : le PDG ajoute des photos à un modèle, les réordonne, saisit des tags, publie, puis retire les photos
// (la dernière retirée dépublie le modèle).
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

// PNG 8×8 valide, généré à la volée : le navigateur le redimensionne comme une vraie photo.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mP8z8DwnwEJMDKgAaQRALp9Af9RNMN1AAAAAElFTkSuQmCC",
  "base64",
);
const NOM = "Boubou E2E Lookbook";
let modeleId;

test("préparation : un modèle sans photo ne peut pas être publié", async ({ page, request }) => {
  const r = await request.post("/api/modeles", { data: { nom: NOM, categorie: "BOUBOU" } });
  expect(r.status()).toBe(201);
  modeleId = (await r.json()).id;
  await page.goto(`/modeles/${modeleId}`);
  await expect(page.getByTestId("lookbook")).toBeVisible();
  await expect(page.getByTestId("basculer-publication")).toBeDisabled();
  await expect(page.getByTestId("etat-publication")).toContainText("Non publié");
});

test("ajoute deux photos, la première est la couverture ; réordonne", async ({ page }) => {
  await page.goto(`/modeles/${modeleId}`);
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("fichier-photo").setInputFiles({ name: `photo-${i}.png`, mimeType: "image/png", buffer: PNG });
    await expect(page.getByTestId("galerie").locator("li")).toHaveCount(i + 1);
  }
  await expect(page.getByTestId("photo-0")).toContainText("Photo de couverture");
  const avant = await page.getByTestId("photo-1").locator("img").getAttribute("src");
  await page.getByTestId("photo-1").getByRole("button", { name: "Avancer la photo" }).click();
  await expect(page.getByTestId("photo-0").locator("img")).toHaveAttribute("src", avant);
  // Les images sont bien servies (octets valides, pas d'image cassée).
  const ok = await page.getByTestId("photo-0").locator("img").evaluate((img) => img.complete && img.naturalWidth > 0);
  expect(ok).toBe(true);
});

test("tags puis publication", async ({ page }) => {
  await page.goto(`/modeles/${modeleId}`);
  await page.getByTestId("tags").fill("mariage, wax, Mariage");
  await page.getByTestId("enregistrer-tags").click();
  await expect(page.getByTestId("tags")).toHaveValue("mariage, wax");
  await page.getByTestId("basculer-publication").click();
  await expect(page.getByTestId("etat-publication")).toContainText("Publié");
  await page.reload();
  await expect(page.getByTestId("etat-publication")).toContainText("Publié");
});

test("retirer toutes les photos dépublie le modèle", async ({ page }) => {
  await page.goto(`/modeles/${modeleId}`);
  await page.getByTestId("supprimer-photo-0").click();
  await expect(page.getByTestId("galerie").locator("li")).toHaveCount(1);
  await page.getByTestId("supprimer-photo-0").click();
  await expect(page.getByTestId("galerie")).toHaveCount(0);
  await expect(page.getByTestId("etat-publication")).toContainText("Non publié");
  await expect(page.getByText("Une erreur inattendue")).toHaveCount(0);
});
