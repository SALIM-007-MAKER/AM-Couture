import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Parcours du PDG (rôle ADMIN d'un atelier) : cliente → commande → paiement.
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

const NOM_CLIENTE = "Nouvelle-E2E";

test("crée une cliente et la retrouve dans la liste", async ({ page }) => {
  await page.goto("/clientes/nouvelle");
  await page.getByLabel(/^Nom \*/).fill(NOM_CLIENTE);
  await page.getByLabel(/^Prénom \*/).fill("Fatou");
  await page.getByLabel(/^Téléphone \*/).fill("91234567");
  await page.getByRole("button", { name: "Enregistrer" }).click();

  await page.goto("/clientes");
  await expect(page.getByText(NOM_CLIENTE).first()).toBeVisible();
});

test("refuse une cliente dont le téléphone existe déjà", async ({ page }) => {
  await page.goto("/clientes/nouvelle");
  await page.getByLabel(/^Nom \*/).fill("Doublon");
  await page.getByLabel(/^Prénom \*/).fill("Test");
  await page.getByLabel(/^Téléphone \*/).fill("91234567"); // déjà pris par la cliente créée ci-dessus
  await page.getByRole("button", { name: "Enregistrer" }).click();
  // Le message métier s'affiche (régression : un écran d'erreur générique remplaçait toute la page).
  await expect(page.getByText("Un client existe déjà avec ce numéro de téléphone.")).toBeVisible();
  await expect(page.getByText("Une erreur inattendue est survenue")).toHaveCount(0);
  await expect(page).toHaveURL(/\/clientes\/nouvelle/);
});

test("règle métier : pas de commande pour une cliente sans mesure", async ({ page }) => {
  await page.goto("/commandes/nouvelle");
  await page.getByLabel(/^Client \*/).selectOption({ label: `${NOM_CLIENTE} Fatou — 91234567` });
  await expect(page.getByText(/aucune mesure enregistrée/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
});

test("crée une commande puis enregistre un paiement : le solde diminue", async ({ page }) => {
  await page.goto("/commandes/nouvelle");
  await page.getByLabel(/^Client \*/).selectOption({ label: "Alpha Bintou — 90000002" });
  await page.getByLabel(/^Type de vêtement \*/).selectOption({ label: "Boubou" });
  await page.getByLabel(/^Prix total \*/).fill("40000");
  const dans10jours = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel(/^Date de livraison prévue \*/).fill(dans10jours);
  await page.getByRole("button", { name: "Enregistrer" }).click();

  // La création mène à la fiche de la commande.
  await expect(page).toHaveURL(/\/commandes\/[a-z0-9]+$/);
  await expect(page.getByText("40000").first()).toBeVisible();

  await page.getByLabel(/^Montant \*/).fill("15000");
  await page.getByRole("button", { name: "Ajouter le paiement" }).click();

  // Solde = 40000 - 15000.
  await expect(page.getByText("25000").first()).toBeVisible();
});

test("refuse un paiement supérieur au solde et n'enregistre rien", async ({ page }) => {
  await page.goto("/commandes");
  await page.getByRole("row", { name: /Alpha Bintou/ }).getByRole("link", { name: "Voir" }).click();
  await expect(page.getByText("25000").first()).toBeVisible();

  await page.getByLabel(/^Montant \*/).fill("999999");
  await page.getByRole("button", { name: "Ajouter le paiement" }).click();

  await expect(page.getByText(/dépasse|supérieur|solde/i).first()).toBeVisible();
  // Le solde n'a pas bougé.
  await expect(page.getByText("25000").first()).toBeVisible();
});

test("ne voit que les données de son atelier", async ({ page }) => {
  await page.goto("/clientes");
  await expect(page.getByText("Awa").first()).toBeVisible();
  await expect(page.getByText("Secrète")).toHaveCount(0);

  await page.goto("/commandes");
  await expect(page.getByText("E2E-ALPHA-001").first()).toBeVisible();
  await expect(page.getByText("E2E-BETA-001")).toHaveCount(0);
});

test("l'espace plateforme lui est fermé : redirection vers son tableau de bord", async ({ page }) => {
  await page.goto("/ateliers");
  await expect(page).toHaveURL(/\/$/);
});
