import { test, expect, request } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Parcours d'abonnement de bout en bout : fin d'essai → souscription (déclaration d'un paiement) → vérification par le
// SUPERADMIN → accès rétabli → justificatif. Atelier GAMMA : essai terminé depuis 30 jours (lecture seule).
// Atelier DELTA : essai terminé depuis 3 jours (période de grâce).
const base = "http://localhost:5173";
const ESPACE = /[\s  ]?/;

test.describe("période de grâce", () => {
  test.use({ storageState: ETATS.delta });

  test("un atelier en période de grâce voit un avertissement mais peut encore saisir", async ({ page }) => {
    await page.goto("/clientes/nouvelle");
    const bandeau = page.getByTestId("acces-banner");
    await expect(bandeau).toBeVisible();
    await expect(bandeau).toHaveAttribute("data-mode", "GRACE");
    await expect(bandeau).toContainText(/accès complet jusqu/i);
    await page.getByLabel(/^Nom \*/).fill("Cliente-Grace");
    await page.getByLabel(/^Prénom \*/).fill("Test");
    await page.getByLabel(/^Téléphone \*/).fill("93333333");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).not.toHaveURL(/\/clientes\/nouvelle/);
  });
});

test.describe("lecture seule puis souscription", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: ETATS.gamma });

  test("lecture seule : bandeau rouge, consultation possible, saisie refusée avec un message clair", async ({ page }) => {
    await page.goto("/clientes");
    const bandeau = page.getByTestId("acces-banner");
    await expect(bandeau).toHaveAttribute("data-mode", "LECTURE_SEULE");
    await expect(bandeau).toContainText(/lecture seule/i);
    // La consultation fonctionne (aucune erreur d'écran).
    await expect(page.getByText("Une erreur inattendue est survenue")).toHaveCount(0);

    await page.goto("/clientes/nouvelle");
    await page.getByLabel(/^Nom \*/).fill("Refusee");
    await page.getByLabel(/^Prénom \*/).fill("Test");
    await page.getByLabel(/^Téléphone \*/).fill("94444444");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText(/lecture seule/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/clientes\/nouvelle/);
    await expect(page.getByText("Une erreur inattendue est survenue")).toHaveCount(0);
  });

  test("souscrire : instructions de paiement visibles, déclaration enregistrée, une seule à la fois", async ({ page }) => {
    await page.goto("/abonnement");
    await page.getByTestId("souscrire-Plan E2E").click();
    const form = page.getByTestId("declaration-paiement");
    await expect(form).toBeVisible();
    await expect(page.getByTestId("instructions-paiement")).toContainText("Airtel Money 90 00 00 00");

    // La référence est obligatoire pour un mobile money.
    await form.getByRole("button", { name: "Déclarer mon paiement" }).click();
    await expect(form.getByText(/Indiquez la référence du paiement/)).toBeVisible();

    await form.getByLabel(/^Opérateur/).fill("Airtel Money");
    await form.getByLabel(/^Référence du paiement/).fill("AIR-E2E-0001");
    await form.getByRole("button", { name: "Déclarer mon paiement" }).click();

    await expect(page.getByTestId("message-paiement")).toContainText(/Paiement déclaré/);
    const attente = page.getByTestId("paiement-en-attente");
    await expect(attente).toBeVisible();
    await expect(attente).toContainText(new RegExp(`10${ESPACE.source}000`));
    // Aucun accès accordé par la simple déclaration, et plus de bouton « Souscrire » tant qu'elle n'est pas traitée.
    await expect(page.getByTestId("acces-banner")).toHaveAttribute("data-mode", "LECTURE_SEULE");
    await expect(page.getByTestId("souscrire-Plan E2E")).toHaveCount(0);
    await expect(page.getByTestId("historique-paiements")).toContainText("En attente");
  });

  test("le SUPERADMIN confirme le paiement après rapprochement", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ETATS.superadmin });
    const page = await ctx.newPage();
    await page.goto("/paiements-abonnement");
    const ligne = page.locator("tr", { hasText: "Atelier E2E Gamma" });
    await expect(ligne).toContainText("AIR-E2E-0001");
    await ligne.getByRole("button", { name: "Confirmer" }).click();
    await expect(ligne.getByText(/Avez-vous retrouvé ce paiement/)).toBeVisible();
    await ligne.getByRole("button", { name: "Oui, confirmer" }).click();

    // Le filtre par défaut (« En attente ») ne montre plus la ligne ; on la retrouve dans les paiements confirmés.
    await expect(page.getByTestId("table-paiements").locator("tr", { hasText: "Atelier E2E Gamma" })).toHaveCount(0);
    await page.getByTestId("filtre-statut").selectOption("REUSSIE");
    const confirmee = page.locator("tr", { hasText: "Atelier E2E Gamma" });
    await expect(confirmee).toContainText("Confirmé");
    await expect(confirmee.getByRole("link", { name: /Justificatif FAC-\d{4}-\d{4}/ })).toBeVisible();
    await ctx.close();
  });

  test("l'atelier retrouve un accès complet, son justificatif, et peut de nouveau saisir", async ({ page }) => {
    await page.goto("/abonnement");
    await expect(page.getByText("Actif").first()).toBeVisible();
    await expect(page.getByTestId("acces-banner")).toHaveCount(0);
    await expect(page.getByTestId("paiement-en-attente")).toHaveCount(0);

    const lien = page.getByTestId("historique-paiements").getByRole("link", { name: /FAC-\d{4}-\d{4}/ });
    await expect(lien).toBeVisible();
    const href = await lien.getAttribute("href");
    const api = await request.newContext({ baseURL: base, storageState: ETATS.gamma });
    const pdf = await api.get(href);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
    await api.dispose();

    await page.goto("/clientes/nouvelle");
    await page.getByLabel(/^Nom \*/).fill("Acceptee");
    await page.getByLabel(/^Prénom \*/).fill("Test");
    await page.getByLabel(/^Téléphone \*/).fill("95555555");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).not.toHaveURL(/\/clientes\/nouvelle/);
  });

  test("le justificatif d'un atelier n'est pas accessible à un autre atelier", async () => {
    const gamma = await request.newContext({ baseURL: base, storageState: ETATS.gamma });
    const transactions = await (await gamma.get("/api/abonnements/transactions")).json();
    const factureId = transactions.data.find((t) => t.facture).facture.id;
    await gamma.dispose();
    const alpha = await request.newContext({ baseURL: base, storageState: ETATS.pdg });
    expect((await alpha.get(`/api/abonnements/factures/${factureId}/pdf`)).status()).toBe(404);
    await alpha.dispose();
  });
});

test.describe("tableau de bord commercial", () => {
  test.use({ storageState: ETATS.superadmin });

  test("affiche les revenus, la conversion et les ateliers par état, sans erreur", async ({ page }) => {
    await page.goto("/commerce");
    await expect(page.getByRole("heading", { name: "Tableau de bord commercial" })).toBeVisible();
    await expect(page.getByText(/erreur est survenue/i)).toHaveCount(0);
    // Le seul paiement du jeu de données : 10 000 FCFA confirmés ce mois-ci par le test précédent.
    await expect(page.getByTestId("net-mois")).toContainText(new RegExp(`10${ESPACE.source}000`));
    await expect(page.getByTestId("mrr")).toContainText(new RegExp(`10${ESPACE.source}000`));
    await expect(page.getByTestId("carte-ateliers")).toContainText(/actif\(s\)/);
    await expect(page.getByTestId("table-revenus")).toBeVisible();
    await page.getByTestId("horizon").selectOption("60");
    await expect(page.getByTestId("liste-a-renouveler")).toBeVisible();
  });

  test("réglages : jours de grâce et instructions de paiement modifiables", async ({ page }) => {
    await page.goto("/commerce");
    const form = page.getByTestId("reglages-abonnement");
    await form.getByLabel(/Instructions de paiement/).fill("Virement : compte E2E 0001");
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(form.getByText("Réglages enregistrés.")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("reglages-abonnement").getByLabel(/Instructions de paiement/)).toHaveValue("Virement : compte E2E 0001");
  });
});
