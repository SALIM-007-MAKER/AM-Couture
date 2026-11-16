import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Consultation hors connexion (7.5). Le « hors ligne » est simulé en coupant uniquement les appels /api (le serveur
// injoignable) : c'est le cas le plus courant (réseau présent mais qui ne laisse rien passer) et celui que l'application
// doit gérer en plus de l'absence totale de réseau. Le serveur de développement du frontend reste joignable.
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

const lireInstantane = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const ouverture = indexedDB.open("am-couture-instantane", 1);
        ouverture.onerror = () => resolve(null);
        ouverture.onupgradeneeded = () => ouverture.result.createObjectStore("kv");
        ouverture.onsuccess = () => {
          const db = ouverture.result;
          const req = db.transaction("kv", "readonly").objectStore("kv").get("instantane");
          req.onsuccess = () => {
            db.close();
            resolve(req.result ?? null);
          };
          req.onerror = () => resolve(null);
        };
      }),
  );

test("ce qui a été consulté en ligne est enregistré sur l'appareil, sans les finances", async ({ page }) => {
  await page.goto("/clientes");
  await expect(page.getByText("Alpha Awa").first()).toBeVisible();
  await expect.poll(async () => (await lireInstantane(page))?.requetes?.some((r) => r.key[0] === "clientes"), { timeout: 10_000 }).toBe(true);
  // Navigation dans l'application (sans rechargement) vers un écran financier : consulté, mais jamais conservé.
  await page.getByRole("link", { name: "Paiements" }).first().click();
  await expect(page).toHaveURL(/\/paiements/);
  await page.waitForTimeout(3500); // laisse passer une sauvegarde
  const snap = await lireInstantane(page);
  expect(snap.me.role).toBe("ADMIN");
  expect(snap.requetes.map((r) => r.key[0]).every((k) => ["clientes", "commandes", "modeles", "parametres"].includes(k))).toBe(true);
  expect(JSON.stringify(snap)).not.toContain("passwordHash");
});

test("serveur injoignable : l'application s'ouvre avec les données enregistrées et le dit", async ({ page, context }) => {
  await page.goto("/clientes");
  await expect(page.getByText("Alpha Awa").first()).toBeVisible();
  await expect.poll(async () => Boolean(await lireInstantane(page)), { timeout: 10_000 }).toBe(true);

  await context.route("**/api/**", (route) => route.abort());
  await page.reload();
  await expect(page.getByText("Alpha Awa").first()).toBeVisible();
  await expect(page.getByTestId("hors-ligne")).toBeVisible();
  await expect(page.getByTestId("hors-ligne")).toContainText("Dernière connexion au serveur");
  expect(page.url()).not.toContain("/login");

  // Une page jamais consultée en ligne : on le dit, sans chargement infini.
  await page.getByRole("link", { name: "Stock" }).first().click();
  await expect(page.getByTestId("hors-ligne-vide")).toBeVisible();

  // Une écriture sûre (créer une cliente) est gardée sur l'appareil, pas perdue ni envoyée tout de suite (détails : hors-ligne-ecritures.spec.js).
  await page.getByRole("link", { name: "Clients" }).first().click();
  await page.getByRole("link", { name: /Nouveau client/ }).first().click();
  await page.getByLabel(/^Nom \*/).fill("Hors-ligne-E2E");
  await page.getByLabel(/^Prénom \*/).fill("Test");
  await page.getByLabel(/^Téléphone \*/).fill("98765432");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByTestId("file-ecritures")).toContainText("1 modification(s) en attente");

  // Retour du serveur : le bandeau disparaît et la cliente existe, une seule fois.
  await context.unroute("**/api/**");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByTestId("hors-ligne")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("file-ecritures")).toHaveCount(0, { timeout: 15_000 });
  const r = await page.request.get("/api/clientes?q=Hors-ligne-E2E");
  // (la recherche compare aussi les chiffres du terme au téléphone : on filtre donc sur le nom)
  expect((await r.json()).data.filter((c) => c.nom === "Hors-ligne-E2E")).toHaveLength(1);
});

test("à la déconnexion, l'instantané est effacé de l'appareil", async ({ page, browser }) => {
  // Contexte à part : se déconnecter ne doit pas toucher la session des autres tests.
  const ctx = await browser.newContext({ storageState: ETATS.pdg });
  const p = await ctx.newPage();
  await p.goto("/clientes");
  await expect(p.getByText("Alpha Awa").first()).toBeVisible();
  await expect.poll(async () => Boolean(await lireInstantane(p)), { timeout: 10_000 }).toBe(true);
  await p.getByRole("button", { name: "Déconnexion" }).first().click();
  await p.waitForURL(/\/login/);
  await expect.poll(async () => await lireInstantane(p), { timeout: 5_000 }).toBeNull();
  await ctx.close();
  void page;
});
