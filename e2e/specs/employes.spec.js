import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";
import { MOT_DE_PASSE } from "../seed.js";
import { ouvrirSession } from "../session.js";

// Gestion des employés par le PDG, puis parcours de l'employé créé (navigation limitée, aucun montant, désactivation).
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

const IDENTIFIANT = "e2e-employe-recep";

test("le PDG crée un employé réceptionniste depuis l'interface", async ({ page }) => {
  await page.goto("/employes/nouveau");
  await page.getByLabel(/^Prénom/).fill("Rama");
  await page.getByLabel(/^Nom \*/).fill("Employée");
  await page.getByLabel(/^Identifiant de connexion/).fill(IDENTIFIANT);
  await page.getByLabel(/^Mot de passe initial/).fill(MOT_DE_PASSE);
  await page.getByTestId("select-poste").selectOption("RECEPTIONNISTE");
  // Le poste fournit les droits de départ : aucun droit financier.
  await expect(page.getByTestId("perm-clientes.ecrire")).toBeChecked();
  await expect(page.getByTestId("perm-finances.voir")).not.toBeChecked();
  await page.getByTestId("enregistrer-employe").click();
  await expect(page).toHaveURL(/\/employes$/);
  await expect(page.getByTestId(`employe-${IDENTIFIANT}`)).toBeVisible();
});

test("cocher un droit sensible exige le mot de passe du PDG", async ({ page }) => {
  await page.goto("/employes");
  await page.getByTestId(`employe-${IDENTIFIANT}`).getByRole("link", { name: "Gérer" }).click();
  await page.getByTestId("perm-finances.voir").check();
  await expect(page.getByTestId("confirmation-sensible")).toBeVisible();
  await page.getByTestId("perm-finances.voir").uncheck();
  await expect(page.getByTestId("confirmation-sensible")).toHaveCount(0);
});

test.describe("session de l'employé", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("navigation limitée, pages interdites redirigées, aucun écran d'erreur", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#identifiant").fill(IDENTIFIANT);
    await page.locator("#password").fill(MOT_DE_PASSE);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).not.toHaveURL(/\/login/);

    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "Commandes" }).first()).toBeVisible();
    await expect(nav.getByRole("link", { name: "Employés" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Paiements" })).toHaveCount(0);

    for (const interdit of ["/employes", "/paiements", "/depenses", "/finances", "/parametres"]) {
      await page.goto(interdit);
      await expect(page).not.toHaveURL(new RegExp(`${interdit}$`));
    }

    await page.goto("/commandes");
    await expect(page.getByText("Une erreur inattendue")).toHaveCount(0);
    await page.goto("/clientes");
    await expect(page.getByText("Une erreur inattendue")).toHaveCount(0);
  });
});

test("le PDG désactive l'employé : la connexion est refusée", async ({ page }) => {
  await page.goto("/employes");
  await page.getByTestId(`employe-${IDENTIFIANT}`).getByRole("link", { name: "Gérer" }).click();
  await page.getByTestId("desactiver").click();
  await page.getByTestId("confirmer-desactivation").click();
  await expect(page.getByText(/Compte désactivé le/)).toBeVisible();

  expect((await ouvrirSession(IDENTIFIANT)).status).toBe(403);
});
