import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Cloche de notifications de l'en-tête du SUPERADMIN : présente, pastille cohérente avec ce que renvoie le serveur,
// page qui s'ouvre avec ses deux sections, et en-tête qui tient sur téléphone.

async function pastilleAttendue(page) {
  const paiements = await (await page.request.get("/api/plateforme/paiements-a-valider")).json();
  const alertes = await (await page.request.get("/api/ateliers/alertes")).json();
  return paiements.total + alertes.abonnementsAlerte.length;
}

test.describe("SuperAdmin : cloche de notifications", () => {
  test.use({ storageState: ETATS.superadmin, viewport: { width: 1280, height: 700 } });

  test("la cloche est dans l'en-tête, sa pastille suit le serveur, et la page s'ouvre", async ({ page }) => {
    await page.goto("/vue-ensemble");
    const attendu = await pastilleAttendue(page);
    const cloche = page.locator("header").getByRole("link", { name: /Notification/ });
    await expect(cloche).toBeVisible();
    if (attendu > 0) {
      await expect(cloche).toHaveAttribute("aria-label", `${attendu} notification(s) non lue(s)`);
    } else {
      await expect(cloche).toHaveAttribute("aria-label", "Notifications");
    }

    await cloche.click();
    await expect(page).toHaveURL(/\/notifications-plateforme$/);
    await expect(page.getByRole("heading", { name: "Notifications", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Paiements à valider" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alertes sur les ateliers" })).toBeVisible();
  });
});

test.describe("SuperAdmin : cloche sur téléphone", () => {
  test.use({ storageState: ETATS.superadmin, viewport: { width: 390, height: 800 } });

  test("la cloche reste visible, l'en-tête ne déborde pas, la déconnexion reste dans l'écran", async ({ page }) => {
    await page.goto("/vue-ensemble");
    await expect(page.locator("header").getByRole("link", { name: /Notification/ })).toBeVisible();
    const debordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(debordement).toBeLessThanOrEqual(0);
    const droite = await page.locator("header").getByRole("button", { name: /Déconnexion/ }).evaluate((b) => b.getBoundingClientRect().right);
    expect(droite).toBeLessThanOrEqual(390);
  });
});
