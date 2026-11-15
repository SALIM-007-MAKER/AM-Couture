import { test, expect } from "@playwright/test";
import { COMPTES, MOT_DE_PASSE } from "../seed.js";

// Sans session : ce fichier teste l'accès non authentifié et la connexion elle-même.
test.use({ storageState: { cookies: [], origins: [] } });

test("une page protégée sans session renvoie vers la connexion", async ({ page }) => {
  await page.goto("/clientes");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByLabel(/identifiant/i)).toBeVisible();
});

test("mauvais mot de passe : message d'erreur et on reste sur la connexion", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/identifiant/i).fill(COMPTES.pdgAlpha);
  await page.locator("#password").fill("mauvais-mot-de-passe");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByText(/incorrect|invalide/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("le PDG se connecte et arrive sur son tableau de bord", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/identifiant/i).fill(COMPTES.pdgAlpha);
  await page.locator("#password").fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Atelier E2E Alpha").first()).toBeVisible();
});
