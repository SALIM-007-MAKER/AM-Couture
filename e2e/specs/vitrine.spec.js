import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Vitrine publique : le PDG la règle et l'active ; un visiteur SANS compte voit les modèles publiés (et seulement eux) ;
// la désactiver la ferme immédiatement.
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

const SLUG = "atelier-e2e-vitrine";
// PNG 8×8 valide.
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mP8z8DwnwEJMDKgAaQRALp9Af9RNMN1AAAAAElFTkSuQmCC";

test("préparation : un modèle publié avec photo, un brouillon", async ({ request }) => {
  expect((await request.patch("/api/parametres", { data: { telephone: "+221770000000", adresse: "12 rue du Marché" } })).status()).toBe(200);
  const pub = await request.post("/api/modeles", { data: { nom: "Kaftan E2E Publié", categorie: "KAFTAN", description: "Coupe ample", prixIndicatif: "77777", tags: ["fête"] } });
  expect(pub.status()).toBe(201);
  const id = (await pub.json()).id;
  expect((await request.post(`/api/modeles/${id}/photos`, { data: { image: `data:image/png;base64,${PNG_B64}` } })).status()).toBe(201);
  expect((await request.patch(`/api/modeles/${id}`, { data: { publie: true } })).status()).toBe(200);
  expect((await request.post("/api/modeles", { data: { nom: "Brouillon E2E Caché", categorie: "ROBE" } })).status()).toBe(201);
});

test("le PDG règle la vitrine : couleur trop claire refusée, puis activation", async ({ page }) => {
  await page.goto("/vitrine");
  await page.getByTestId("vitrine-slug").fill(SLUG);
  await page.getByTestId("vitrine-description-champ").fill("Atelier de couture sur mesure.");
  await page.getByTestId("vitrine-couleur").fill("#ffd700");
  await page.getByTestId("vitrine-active").check();
  await page.getByTestId("enregistrer-vitrine").click();
  await expect(page.getByText("Couleur trop claire : un texte blanc")).toBeVisible();

  await page.getByTestId("vitrine-couleur").fill("#800020");
  await page.getByTestId("vitrine-contact-champ").check();
  await page.getByTestId("enregistrer-vitrine").click();
  await expect(page.getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible();
  await expect(page.getByTestId("vitrine-lien")).toContainText(`/a/${SLUG}`);
  await expect(page.getByTestId("vitrine-publies")).toContainText("1 modèle");
});

test("un visiteur sans compte voit les modèles publiés, pas le brouillon, aucun prix", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto(`/a/${SLUG}`);
  await expect(page.getByTestId("vitrine-nom")).toBeVisible();
  await expect(page.getByTestId("vitrine-description")).toContainText("Atelier de couture sur mesure.");
  await expect(page.getByTestId("vitrine-contact")).toBeVisible(); // coordonnées choisies par le PDG
  const carte = page.getByTestId("modele-Kaftan E2E Publié");
  await expect(carte).toBeVisible();
  await expect(page.getByTestId("modele-Brouillon E2E Caché")).toHaveCount(0);
  await expect(page.getByText("77777")).toHaveCount(0);
  const chargee = await carte.locator("img").evaluate((img) => img.complete && img.naturalWidth > 0);
  expect(chargee).toBe(true);
  expect(page.url()).not.toContain("/login");

  await carte.click();
  await expect(page.getByTestId("vitrine-detail")).toContainText("Coupe ample");
  await page.getByRole("button", { name: "Fermer" }).click();
  await page.getByTestId("vitrine-tags").getByRole("button", { name: "fête" }).click();
  await expect(carte).toBeVisible();
  await page.getByLabel("Rechercher un modèle…").fill("introuvable-xyz");
  await expect(page.getByTestId("vitrine-vide")).toBeVisible();
  await ctx.close();
});

test("adresse inconnue ou vitrine désactivée : même page « introuvable »", async ({ browser, page }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const visiteur = await ctx.newPage();
  await visiteur.goto("/a/adresse-qui-nexiste-pas");
  await expect(visiteur.getByTestId("vitrine-introuvable")).toBeVisible();

  await page.goto("/vitrine");
  await page.getByTestId("vitrine-active").uncheck();
  await page.getByTestId("enregistrer-vitrine").click();
  await expect(page.getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible();

  await visiteur.goto(`/a/${SLUG}`);
  await expect(visiteur.getByTestId("vitrine-introuvable")).toBeVisible();
  await expect(visiteur.getByText("Kaftan E2E Publié")).toHaveCount(0);
  await ctx.close();
});
