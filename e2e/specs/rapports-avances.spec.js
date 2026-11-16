import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";
import { MOT_DE_PASSE } from "../seed.js";

// Rapports avancés (6.7) : le PDG voit les cinq rapports ; un employé n'y accède qu'avec la permission distincte,
// et sans « voir tous les montants » les rapports chiffrés sont absents.
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

const MDP = MOT_DE_PASSE;
const unique = Date.now().toString().slice(-7);

test("le PDG ouvre les rapports avancés depuis les rapports : cinq sections, aucune erreur", async ({ page }) => {
  await page.goto("/rapports");
  await page.getByTestId("lien-rapports-avances").click();
  await expect(page).toHaveURL(/\/rapports\/avances/);
  for (const id of ["ra-production", "ra-retards", "ra-achats", "ra-depenses", "ra-marges"]) {
    // Achats et dépenses peuvent être vides sur la base de test : on attend alors le texte « Aucune donnée ».
    if (id === "ra-achats" || id === "ra-depenses") continue;
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId("ra-production")).toContainText("Non affectées");
  await expect(page.getByText("Une erreur inattendue est survenue")).toHaveCount(0);
  await expect(page.getByTestId("ra-marges")).toContainText("Ordre de grandeur");
});

test.describe("employé", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  async function creerEtConnecter(browser, permissions, nom) {
    const pdg = await browser.newContext({ storageState: ETATS.pdg });
    const identifiant = `ra-${nom}-${unique}`;
    const r = await pdg.request.post("/api/employes", { data: { identifiant, password: MDP, prenom: "Rap", nom, permissions } });
    const statut = r.status();
    const corps = await r.text();
    await pdg.close();
    expect(statut, corps).toBe(201);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.locator("#identifiant").fill(identifiant);
    await page.locator("#password").fill(MDP);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).not.toHaveURL(/\/login/);
    return { ctx, page };
  }

  test("sans la permission distincte : page interdite, pas de lien", async ({ browser }) => {
    const { ctx, page } = await creerEtConnecter(browser, ["rapports.lire", "dashboard.lire"], "sans");
    await page.goto("/rapports");
    await expect(page.getByTestId("lien-rapports-avances")).toHaveCount(0);
    await page.goto("/rapports/avances");
    await expect(page.getByTestId("ra-production")).toHaveCount(0);
    expect((await ctx.request.get("/api/rapports/avances/production")).status()).toBe(403);
    await ctx.close();
  });

  test("avec la permission mais sans les montants : production et retards, pas d'achats ni de marges", async ({ browser }) => {
    const { ctx, page } = await creerEtConnecter(browser, ["rapports.avances"], "avec");
    await page.goto("/rapports/avances");
    await expect(page.getByTestId("ra-production")).toBeVisible();
    await expect(page.getByTestId("ra-retards")).toBeVisible();
    await expect(page.getByTestId("ra-marges")).toHaveCount(0);
    expect((await ctx.request.get("/api/rapports/avances/marges")).status()).toBe(403);
    await ctx.close();
  });
});
