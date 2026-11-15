import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Parcours du SUPERADMIN : administre les ateliers, n'a accès à aucune donnée métier d'un atelier.
test.use({ storageState: ETATS.superadmin });

test("arrive sur la liste des ateliers et les voit tous", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/ateliers$/);
  await expect(page.getByText("Atelier E2E Alpha").first()).toBeVisible();
  await expect(page.getByText("Atelier E2E Beta").first()).toBeVisible();
});

test("ouvre la fiche d'un atelier", async ({ page }) => {
  await page.goto("/ateliers");
  await page.getByRole("row", { name: /Atelier E2E Alpha/ }).getByRole("link", { name: "Gérer" }).click();
  await expect(page).toHaveURL(/\/ateliers\/[a-z0-9]+$/);
  await expect(page.getByText("Atelier E2E Alpha").first()).toBeVisible();
});

test("la vue d'ensemble de la plateforme se charge", async ({ page }) => {
  await page.goto("/vue-ensemble");
  await expect(page).toHaveURL(/\/vue-ensemble$/);
  await expect(page.getByText(/erreur est survenue/i)).toHaveCount(0);
});

test("les écrans métier d'un atelier lui sont fermés : redirection vers les ateliers", async ({ page }) => {
  for (const chemin of ["/clientes", "/commandes", "/paiements"]) {
    await page.goto(chemin);
    await expect(page).toHaveURL(/\/ateliers$/);
  }
});
