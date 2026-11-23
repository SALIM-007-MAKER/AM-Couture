import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Barre latérale : fixe à gauche pendant le défilement de la page (ordinateur), défilement INTERNE quand le menu dépasse la
// hauteur de l'écran, tiroir mobile fonctionnel, aucun chevauchement avec le contenu. Vérifié sur l'espace SuperAdmin
// (SuperadminLayout) et sur celui du PDG (AppLayout) : les deux layouts portent la même règle.
test.describe.configure({ mode: "serial" });

const ESPACES = [
  { nom: "SuperAdmin", etat: ETATS.superadmin, url: "/tarifs-abonnement" },
  { nom: "PDG", etat: ETATS.pdg, url: "/abonnement" },
];

/** Allonge la page pour qu'elle défile, sans toucher à la barre latérale : ajoute un bloc haut à la fin du contenu principal. */
async function rendreDefilable(page) {
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.id = "espaceur-test";
    spacer.style.height = "3000px";
    (document.querySelector("main") ?? document.body).appendChild(spacer);
  });
}

for (const espace of ESPACES) {
  test.describe(`barre latérale — ${espace.nom}`, () => {
    test("ordinateur : reste fixe et pleine hauteur pendant le défilement ; le contenu défile seul", async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: espace.etat, viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage();
      await page.goto(espace.url);
      const aside = page.locator("aside").first();
      await expect(aside).toBeVisible();
      await rendreDefilable(page);

      const avant = await aside.boundingBox();
      const contenuAvant = await page.locator("main").first().boundingBox();
      expect(avant.x).toBe(0);
      expect(avant.y).toBe(0);
      expect(Math.round(avant.height)).toBe(720); // toute la hauteur de l'écran

      await page.evaluate(() => window.scrollTo(0, 1500));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);

      const apres = await aside.boundingBox();
      const contenuApres = await page.locator("main").first().boundingBox();
      expect(apres.y, "la barre latérale ne bouge pas avec le défilement").toBe(0);
      expect(Math.round(apres.height)).toBe(720);
      expect(apres.x).toBe(0);
      expect(contenuApres.y, "le contenu principal, lui, a défilé").toBeLessThan(contenuAvant.y - 500);
      // Pas de chevauchement : le contenu commence à droite de la barre latérale.
      expect(contenuApres.x).toBeGreaterThanOrEqual(apres.x + apres.width - 1);
      await ctx.close();
    });

    test("ordinateur, écran bas : le menu défile à l'intérieur de la barre, la page n'est pas entraînée", async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: espace.etat, viewport: { width: 1280, height: 360 } });
      const page = await ctx.newPage();
      await page.goto(espace.url);
      const aside = page.locator("aside").first();
      await expect(aside).toBeVisible();
      await rendreDefilable(page);

      // Zone des menus : le conteneur défilable directement à l'intérieur de la barre.
      const info = await aside.evaluate((el) => {
        const zone = [...el.querySelectorAll("div")].find((d) => getComputedStyle(d).overflowY === "auto");
        return zone ? { defilable: zone.scrollHeight > zone.clientHeight, hauteurBarre: el.getBoundingClientRect().height } : null;
      });
      expect(info, "une zone à défilement interne existe dans la barre").not.toBeNull();
      expect(Math.round(info.hauteurBarre)).toBe(360);
      expect(info.defilable, "le menu dépasse 360 px : il doit défiler dans la barre").toBe(true);

      // Défiler le menu ne fait pas défiler la page et la barre reste en place.
      await aside.hover({ position: { x: 40, y: 150 } });
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(200);
      const dedans = await aside.evaluate((el) => {
        const zone = [...el.querySelectorAll("div")].find((d) => getComputedStyle(d).overflowY === "auto");
        return zone.scrollTop;
      });
      expect(dedans, "le menu a défilé à l'intérieur de la barre").toBeGreaterThan(0);
      expect((await aside.boundingBox()).y).toBe(0);
      await ctx.close();
    });

    test("mobile : barre fixe masquée, tiroir qui s'ouvre et se ferme, sans chevauchement permanent", async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: espace.etat, viewport: { width: 390, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(espace.url);
      await expect(page.locator("aside").first()).toBeHidden();

      const ouvrir = page.getByRole("button", { name: "Ouvrir le menu" });
      await expect(ouvrir).toBeVisible();
      const contenu = await page.locator("main").first().boundingBox();
      expect(contenu.x, "le contenu occupe toute la largeur quand le tiroir est fermé").toBeLessThanOrEqual(1);

      await ouvrir.click();
      const tiroir = page.locator("div.fixed.inset-y-0.left-0");
      await expect(tiroir).toHaveClass(/translate-x-0/);
      // Le tiroir glisse en 200 ms : on attend la fin du mouvement avant de mesurer.
      await expect.poll(async () => (await tiroir.boundingBox()).x).toBe(0);
      const boite = await tiroir.boundingBox();
      expect(Math.round(boite.height)).toBe(800);
      expect(boite.width).toBeLessThanOrEqual(280);

      await page.getByRole("button", { name: "Fermer le menu" }).first().click({ position: { x: 360, y: 400 } });
      await expect(tiroir).toHaveClass(/-translate-x-full/);
      await ctx.close();
    });
  });
}
