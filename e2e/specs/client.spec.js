import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Parcours de la cliente finale (rôle USER) : lecture de ses propres données uniquement.
test.use({ storageState: ETATS.client });

test("voit son profil", async ({ page }) => {
  await page.goto("/client");
  await expect(page.getByText("Alpha Awa").first()).toBeVisible();
  await expect(page.getByText("90000001")).toBeVisible();
});

test("voit sa commande avec le montant payé et le reste à payer", async ({ page }) => {
  await page.goto("/client/commandes");
  await expect(page.getByText("E2E-ALPHA-001")).toBeVisible();
  await expect(page.getByText("Payé 20000 / 50000")).toBeVisible();
  await expect(page.getByText("Reste 30000")).toBeVisible();
});

test("ne voit aucune commande d'un autre atelier", async ({ page }) => {
  await page.goto("/client/commandes");
  await expect(page.getByText("E2E-ALPHA-001")).toBeVisible();
  await expect(page.getByText("E2E-BETA-001")).toHaveCount(0);
});

test("l'espace de gestion lui est fermé : redirection vers son espace", async ({ page }) => {
  for (const chemin of ["/clientes", "/commandes", "/paiements", "/ateliers"]) {
    await page.goto(chemin);
    await expect(page).toHaveURL(/\/client$/);
  }
});

test("la fiche d'une commande d'un autre atelier n'est pas accessible", async ({ page }) => {
  await page.goto(`/client/commandes/${process.env.E2E_COMMANDE_BETA_ID}`);
  await expect(page.getByText("Secrète")).toHaveCount(0);
  await expect(page.getByText("99999")).toHaveCount(0);
});
