import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";
import { MOT_DE_PASSE } from "../seed.js";
import { ouvrirSession } from "../session.js";

// Fournisseurs : le PDG en crée un, le doublon est refusé avec un message clair, puis un magasinier (poste) y accède.
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

const NOM = "Tissus E2E du Marché";
const MAGASINIER = "e2e-magasinier-fou";

test("le PDG crée un fournisseur et le retrouve dans la liste", async ({ page }) => {
  await page.goto("/fournisseurs/nouveau");
  await page.getByLabel(/^Nom \*/).fill(NOM);
  await page.getByLabel("Personne à contacter").fill("Mme Diallo");
  await page.getByLabel("Téléphone").fill("+221770000001");
  await page.getByTestId("enregistrer-fournisseur").click();
  await expect(page.getByRole("heading", { name: NOM })).toBeVisible();

  await page.goto("/fournisseurs");
  await expect(page.getByTestId(`fournisseur-${NOM}`)).toBeVisible();
});

test("un nom déjà pris est refusé avec un message métier", async ({ page }) => {
  await page.goto("/fournisseurs/nouveau");
  await page.getByLabel(/^Nom \*/).fill(NOM.toUpperCase());
  await page.getByTestId("enregistrer-fournisseur").click();
  await expect(page.getByText("Un fournisseur porte déjà ce nom.")).toBeVisible();
  await expect(page.getByText("Une erreur inattendue")).toHaveCount(0);
  await expect(page).toHaveURL(/\/fournisseurs\/nouveau/);
});

test("le PDG crée un magasinier : il voit les fournisseurs, sans les finances", async ({ page, browser }) => {
  await page.goto("/employes/nouveau");
  await page.getByLabel(/^Prénom/).fill("Ibrahima");
  await page.getByLabel(/^Nom \*/).fill("Magasinier");
  await page.getByLabel(/^Identifiant de connexion/).fill(MAGASINIER);
  await page.getByLabel(/^Mot de passe initial/).fill(MOT_DE_PASSE);
  await page.getByTestId("select-poste").selectOption("MAGASINIER");
  await expect(page.getByTestId("perm-fournisseurs.ecrire")).toBeChecked();
  await page.getByTestId("enregistrer-employe").click();
  await expect(page.getByTestId(`employe-${MAGASINIER}`)).toBeVisible();

  const { status, storageState } = await ouvrirSession(MAGASINIER);
  expect(status).toBe(200);
  const ctx = await browser.newContext({ storageState });
  const emp = await ctx.newPage();
  await emp.goto("/");
  await expect(emp).not.toHaveURL(/\/login/);
  await expect(emp.getByRole("navigation").getByRole("link", { name: "Fournisseurs" })).toBeVisible();
  await emp.goto("/fournisseurs");
  await expect(emp.getByTestId(`fournisseur-${NOM}`)).toBeVisible();
  await expect(emp.getByText("Une erreur inattendue")).toHaveCount(0);
  await emp.goto("/depenses");
  await expect(emp).not.toHaveURL(/\/depenses$/);
  await ctx.close();
});

test("le PDG archive le fournisseur : il quitte la liste active", async ({ page }) => {
  await page.goto("/fournisseurs");
  await page.getByTestId(`fournisseur-${NOM}`).getByRole("link", { name: "Voir" }).click();
  await page.getByRole("button", { name: "Archiver" }).click();
  await page.getByRole("button", { name: /confirmer|oui/i }).click();
  await page.goto("/fournisseurs");
  await expect(page.getByTestId(`fournisseur-${NOM}`)).toHaveCount(0);
});
