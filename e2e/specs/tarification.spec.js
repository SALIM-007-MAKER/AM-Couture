import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Tarification Niger (FCFA) : le SUPERADMIN administre les formules (prix mensuel et annuel, quotas, activation), le PDG voit
// les formules proposées avec une bascule Mensuel / Annuel. Les montants ci-dessous sont des DONNÉES DE TEST : aucun tarif
// n'est écrit dans le code de l'application. Aucune formule n'est proposée tant qu'elle n'est pas activée avec tarif et quotas.
const NOM = "Formule E2E Tarif";
const ESPACE = "[\\s\\u00a0\\u202f]?";
const montant = (n) => new RegExp(String(n).replace(/(\d)(?=(\d{3})+$)/g, `$1${ESPACE}`));

test.describe("formule : de la préconfiguration à l'offre", () => {
  test.describe.configure({ mode: "serial" });

  test("SUPERADMIN : une formule créée est inactive, économie informative, activation bloquée sans quotas définis", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ETATS.superadmin });
    const page = await ctx.newPage();
    await page.goto("/tarifs-abonnement");
    await expect(page.getByRole("heading", { name: "Formules et tarification" })).toBeVisible();

    await page.getByRole("button", { name: "Nouvelle formule" }).click();
    await page.getByTestId("champ-nom").fill(NOM);
    await page.getByTestId("champ-description").fill("Formule de test pour les petits ateliers.");
    await page.getByTestId("champ-prix-mensuel").fill("3000");
    await page.getByTestId("champ-prix-annuel").fill("30000");
    // Économie annuelle calculée automatiquement, à titre informatif.
    await expect(page.getByTestId("economie-formulaire")).toContainText(montant(6000));
    await expect(page.getByTestId("economie-formulaire")).toContainText("2 mois offerts");
    await page.getByTestId("enregistrer-formule").click();

    const carte = page.getByTestId(`formule-admin-${NOM}`);
    await expect(carte).toBeVisible();
    await expect(carte.getByTestId("prix-formule")).toContainText(montant(3000));
    await expect(carte.getByTestId("prix-formule")).toContainText(montant(30000));
    await expect(carte.getByTestId("etat-commercial")).toContainText("Non proposée aux ateliers");
    await expect(carte.getByTestId("etat-commercial")).toContainText("inactive");
    await expect(carte.getByTestId("etat-commercial")).toContainText("quotas non définis");
    await expect(carte.getByTestId("quotas-formule")).toContainText("Clientes : Non défini");
    // Formule INACTIVE : le blocage d'activation suffit, pas d'avertissement « illimité » (rien n'est encore proposé).
    await expect(carte.getByTestId("avertissement-quotas")).toHaveCount(0);
    await expect(carte.getByTestId("activation-bloquee")).toBeVisible();
    await expect(carte.getByTestId("basculer-activation")).toBeDisabled();
    await ctx.close();
  });

  test("SUPERADMIN : une formule ACTIVE aux quotas non définis affiche l'avertissement, sans qu'aucune limite soit attribuée", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ETATS.superadmin });
    const page = await ctx.newPage();
    await page.goto("/tarifs-abonnement");
    // « Plan E2E » (jeu de données) est active, a des tarifs et AUCUN quota défini : situation des formules d'avant les quotas.
    const carte = page.getByTestId("formule-admin-Plan E2E");
    await expect(carte.getByTestId("etat-commercial")).toContainText("Proposée aux ateliers");
    const avertissement = carte.getByTestId("avertissement-quotas");
    await expect(avertissement).toBeVisible();
    await expect(avertissement).toContainText("actuellement illimités");
    await expect(avertissement).toContainText("AUCUNE limite");
    for (const ressource of ["Clientes", "Employés", "Commandes actives", "Modèles"]) await expect(avertissement).toContainText(ressource);
    // Aucune limite attribuée automatiquement : les quotas restent « Non défini ».
    await expect(carte.getByTestId("quotas-formule")).toContainText("Clientes : Non défini");
    await expect(carte.getByTestId("quotas-formule")).toContainText("Modèles : Non défini");
    await ctx.close();
  });

  test("PDG : une formule inactive n'apparaît pas dans « Abonnement et tarifs »", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ETATS.pdg });
    const page = await ctx.newPage();
    await page.goto("/abonnement");
    await expect(page.getByRole("heading", { name: "Abonnement et tarifs" })).toBeVisible();
    await expect(page.getByTestId("formule-Plan E2E")).toBeVisible();
    await expect(page.getByTestId(`formule-${NOM}`)).toHaveCount(0);
    await ctx.close();
  });

  test("SUPERADMIN : quotas décidés (limite et illimité explicite), activation, formule proposée", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ETATS.superadmin });
    const page = await ctx.newPage();
    await page.goto("/tarifs-abonnement");
    const carte = page.getByTestId(`formule-admin-${NOM}`);
    await carte.getByTestId("modifier-formule").click();
    await page.getByTestId("quota-clientes").fill("100");
    await page.getByTestId("quota-employes").fill("1");
    await page.getByTestId("quota-commandesActives").fill("50");
    await page.getByTestId("illimite-modeles").check();
    await page.getByTestId("enregistrer-formule").click();

    const apres = page.getByTestId(`formule-admin-${NOM}`);
    await expect(apres.getByTestId("quotas-formule")).toContainText("Clientes : 100");
    await expect(apres.getByTestId("quotas-formule")).toContainText("Modèles : Illimité");
    await expect(apres.getByTestId("basculer-activation")).toBeEnabled();
    await apres.getByTestId("basculer-activation").click();
    await expect(apres.getByTestId("etat-commercial")).toContainText("Proposée aux ateliers");
    await expect(apres.getByTestId("avertissement-quotas")).toHaveCount(0); // quotas décidés : plus d'avertissement

    // Section « abonnés » : aucun atelier abonné à cette formule.
    await apres.getByTestId("voir-abonnes").click();
    await expect(apres.getByTestId("aucun-abonne")).toBeVisible();
    await ctx.close();
  });

  test("PDG : bascule Mensuel / Annuel, prix de la période, économie informative, bouton de déclaration", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ETATS.pdg });
    const page = await ctx.newPage();
    await page.goto("/abonnement");
    const carte = page.getByTestId(`formule-${NOM}`);
    await expect(carte).toBeVisible();
    await expect(carte).toContainText("Formule de test pour les petits ateliers.");
    await expect(page.getByTestId("periode-MENSUEL")).toHaveAttribute("aria-checked", "true");
    await expect(carte.getByTestId("prix-offre")).toContainText(montant(3000));
    await expect(page.getByTestId("badge-mois-offerts")).toContainText("2 mois offerts");

    await page.getByTestId("periode-ANNUEL").click();
    await expect(carte.getByTestId("prix-offre")).toContainText(montant(30000));
    await expect(carte.getByTestId("economie-annuelle")).toContainText(montant(6000));
    await expect(carte.getByTestId("economie-annuelle")).toContainText("2 mois offerts");
    await expect(carte.getByTestId(`souscrire-${NOM}`)).toBeVisible();
    // Le plan hérité (mensuel et annuel configurés dans le jeu de données) suit la même bascule.
    await expect(page.getByTestId("formule-Plan E2E").getByTestId("prix-offre")).toContainText(montant(100000));
    await ctx.close();
  });

  test("API : sans tarif, une période n'est pas souscriptible ; aucun prix par défaut", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ETATS.superadmin });
    const creation = await ctx.request.post("/api/plans-abonnement", {
      data: { nom: "Sans tarif E2E", limites: { clientes: 10, employes: 1, commandesActives: 10, modeles: 10 } },
    });
    expect(creation.status()).toBe(201);
    const plan = await creation.json();
    expect(plan.offres).toEqual([]);
    expect(plan.proposee).toBe(false);
    const activation = await ctx.request.patch(`/api/plans-abonnement/${plan.id}`, { data: { actif: true } });
    expect(activation.status()).toBe(409);
    expect((await activation.json()).details.activation).toEqual(["AUCUN_TARIF"]);
    await ctx.close();
  });

  test("SUPERADMIN : la formule de test est désactivée et n'est plus proposée", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ETATS.superadmin });
    const page = await ctx.newPage();
    await page.goto("/tarifs-abonnement");
    const carte = page.getByTestId(`formule-admin-${NOM}`);
    await carte.getByTestId("basculer-activation").click();
    await expect(carte.getByTestId("etat-commercial")).toContainText("Non proposée aux ateliers");
    await ctx.close();

    const pdg = await browser.newContext({ storageState: ETATS.pdg });
    const pagePdg = await pdg.newPage();
    await pagePdg.goto("/abonnement");
    await expect(pagePdg.getByTestId("formule-Plan E2E")).toBeVisible();
    await expect(pagePdg.getByTestId(`formule-${NOM}`)).toHaveCount(0);
    await pdg.close();
  });
});

test.describe("SuperAdmin : activation manuelle d'un abonnement", () => {
  test.use({ storageState: ETATS.superadmin });

  test("deux modes : prix du catalogue, ou exceptionnel (montant et motif obligatoires) ; rien n'est soumis", async ({ page }) => {
    await page.goto("/ateliers");
    await page.getByRole("row", { name: /Atelier E2E Quota/ }).getByRole("link", { name: "Gérer" }).click();
    await expect(page.getByTestId("mode-catalogue")).toBeVisible();
    await page.getByTestId("mode-catalogue").click();
    const valeur = await page.getByTestId("activation-formule").locator("option", { hasText: "Plan E2E" }).first().getAttribute("value");
    await page.getByTestId("activation-formule").selectOption(valeur);
    await expect(page.getByTestId("prix-catalogue")).toContainText(montant(10000));
    await page.getByTestId("activation-ANNUEL").click();
    await expect(page.getByTestId("prix-catalogue")).toContainText(montant(100000));

    await page.getByTestId("mode-exceptionnel").click();
    await expect(page.getByTestId("montant-exceptionnel")).toBeVisible();
    await expect(page.getByTestId("activation-motif")).toHaveAttribute("required", "");
    await expect(page.getByRole("button", { name: "Activer l'abonnement" })).toBeDisabled();
  });
});
