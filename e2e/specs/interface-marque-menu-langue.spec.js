import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Interface : logo Tailora sur les écrans d'accès, menu latéral fixe (atelier et SuperAdmin) avec défilement interne,
// comportement mobile, et changement de langue du SuperAdmin qui ne le renvoie pas vers un écran d'atelier vide.

test.describe("écrans d'accès", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const chemin of ["/login", "/mot-de-passe-oublie", "/inscription"]) {
    test(`${chemin} : logo Tailora visible, titre de l'onglet Tailora`, async ({ page }) => {
      await page.goto(chemin);
      await expect(page.getByRole("img", { name: /Tailora/ }).first()).toBeVisible();
      await expect(page).toHaveTitle(/Tailora/);
    });
  }

  test("mobile : le logo reste visible et la page ne déborde pas horizontalement", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.goto("/login");
    await expect(page.getByRole("img", { name: /Tailora/ }).first()).toBeVisible();
    const debordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(debordement).toBeLessThanOrEqual(0);
    await ctx.close();
  });
});

/** Fait défiler la page et renvoie la position du menu latéral + l'état de défilement de sa liste. */
async function mesurerMenu(page) {
  await page.evaluate(() => {
    document.querySelector("main").style.minHeight = "3000px"; // page longue : le menu doit rester en place
    window.scrollTo(0, 1200);
  });
  await page.waitForFunction(() => window.scrollY > 600);
  return page.evaluate(() => {
    const aside = document.querySelector("aside");
    const liste = aside.querySelector(".overflow-y-auto");
    return { top: Math.round(aside.getBoundingClientRect().top), scrollY: Math.round(window.scrollY), visible: getComputedStyle(aside).display !== "none", liste: liste.scrollHeight, listeVisible: liste.clientHeight, haut: window.innerHeight };
  });
}

test.describe("menu latéral fixe, atelier (PDG)", () => {
  test.use({ storageState: ETATS.pdg, viewport: { width: 1280, height: 480 } });

  test("reste en haut quand la page défile et défile en interne s'il est trop long", async ({ page }) => {
    await page.goto("/tableau-de-bord");
    await expect(page.getByRole("heading", { name: "Tableau de bord" }).first()).toBeVisible();
    const m = await mesurerMenu(page);
    expect(m.visible).toBe(true);
    expect(m.top).toBe(0);
    expect(m.scrollY).toBeGreaterThan(600);
    expect(m.liste).toBeGreaterThan(m.listeVisible); // trop long pour 480 px : défilement interne nécessaire

    await page.locator("aside .overflow-y-auto").evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(page.locator("aside").getByRole("link", { name: "Abonnement" })).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(600); // la page n'a pas bougé
  });
});

test.describe("mobile, atelier (PDG)", () => {
  test.use({ storageState: ETATS.pdg, viewport: { width: 390, height: 800 } });

  test("pas de menu latéral : bouton de menu et barre du bas, le tiroir défile", async ({ page }) => {
    await page.goto("/tableau-de-bord");
    await expect(page.locator("aside")).toBeHidden();
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    const tiroir = page.getByRole("link", { name: "Abonnement" });
    await tiroir.scrollIntoViewIfNeeded();
    await expect(tiroir).toBeVisible();
    const debordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(debordement).toBeLessThanOrEqual(0);
  });
});

test.describe("SuperAdmin : menu fixe et langue", () => {
  test.use({ storageState: ETATS.superadmin, viewport: { width: 1280, height: 600 } });
  test.describe.configure({ mode: "serial" });

  test("menu latéral fixe avec logo Tailora", async ({ page }) => {
    await page.goto("/ateliers");
    await expect(page.getByRole("img", { name: /Tailora/ }).first()).toBeVisible();
    const m = await mesurerMenu(page);
    expect(m.visible).toBe(true);
    expect(m.top).toBe(0);
  });

  test("changer de langue ne le renvoie pas vers un écran d'atelier : il reste sur Mon compte, tout est traduit", async ({ page, request }) => {
    try {
      await page.goto("/mon-compte");
      await page.getByRole("combobox").first().selectOption("en");
      await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();
      await expect(page).toHaveURL(/\/mon-compte$/);
      await expect(page.getByRole("link", { name: "Workshops" }).first()).toBeVisible();
      // Il reste dans l'espace plateforme après un rechargement.
      await page.goto("/");
      await expect(page).toHaveURL(/\/ateliers$/);
    } finally {
      // Remet le français : la langue est enregistrée sur le compte, les autres tests la supposent en français.
      const res = await request.patch("/api/compte", { data: { langue: "fr" } });
      if (!res.ok()) await page.goto("/mon-compte").then(() => page.getByRole("combobox").first().selectOption("fr"));
    }
  });
});
