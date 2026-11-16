import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";
import { MOT_DE_PASSE } from "../seed.js";
import { ouvrirSession } from "../session.js";

// Achats : le PDG commande, réceptionne en partie (le stock augmente), puis paie (une dépense apparaît) ; un magasinier
// réceptionne le reste sans jamais voir un prix.
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

const FOURNISSEUR = "Tissus E2E Achats";
const ARTICLE = "Wax E2E Achats";
const MAGASINIER = "e2e-magasinier-achats";
let numero;
let articleId;

test("préparation : fournisseur, article de stock et magasinier", async ({ page, request }) => {
  expect((await request.post("/api/fournisseurs", { data: { nom: FOURNISSEUR } })).status()).toBe(201);
  const article = await request.post("/api/stock", { data: { nom: ARTICLE, unite: "METRE" } });
  expect(article.status()).toBe(201);
  articleId = (await article.json()).id;

  await page.goto("/employes/nouveau");
  await page.getByLabel(/^Prénom/).fill("Ibra");
  await page.getByLabel(/^Nom \*/).fill("Réception");
  await page.getByLabel(/^Identifiant de connexion/).fill(MAGASINIER);
  await page.getByLabel(/^Mot de passe initial/).fill(MOT_DE_PASSE);
  await page.getByTestId("select-poste").selectOption("MAGASINIER");
  await expect(page.getByTestId("perm-achats.recevoir")).toBeChecked();
  await expect(page.getByTestId("perm-achats.ecrire")).not.toBeChecked();
  await page.getByTestId("enregistrer-employe").click();
  await expect(page.getByTestId(`employe-${MAGASINIER}`)).toBeVisible();
});

test("le PDG crée un achat : le total est calculé", async ({ page }) => {
  await page.goto("/achats/nouveau");
  await page.getByTestId("select-fournisseur").selectOption({ label: FOURNISSEUR });
  await page.getByTestId("article-0").selectOption({ label: ARTICLE });
  await page.getByTestId("quantite-0").fill("10");
  await page.getByTestId("prix-0").fill("2500");
  await expect(page.getByTestId("total-achat")).toContainText("25000");
  await page.getByTestId("enregistrer-achat").click();
  await expect(page.getByTestId("montant-total")).toHaveText("25000");
  numero = (await page.getByRole("heading").first().textContent()).trim();
  expect(numero).toMatch(/^ACH-\d{4}-\d{4}$/);
});

test("réception partielle : le stock augmente de la quantité reçue", async ({ page, request }) => {
  await page.goto("/achats");
  await page.getByTestId(`achat-${numero}`).getByRole("link", { name: "Voir" }).click();
  await page.getByTestId(`recevoir-${ARTICLE}`).fill("4");
  await page.getByTestId("valider-reception").click();
  await expect(page.getByTestId("badge-reception")).toContainText("Partiellement reçu");

  const article = await (await request.get(`/api/stock/${articleId}`)).json();
  expect(Number(article.quantite)).toBe(4);
});

test("un dépassement est refusé avec un message métier, sans effet", async ({ page, request }) => {
  await page.goto("/achats");
  await page.getByTestId(`achat-${numero}`).getByRole("link", { name: "Voir" }).click();
  await page.getByTestId(`recevoir-${ARTICLE}`).fill("7");
  await page.getByTestId("valider-reception").click();
  await expect(page.getByText("La quantité reçue dépasse la quantité restante à recevoir.")).toBeVisible();
  await expect(page.getByText("Une erreur inattendue")).toHaveCount(0);
  expect(Number((await (await request.get(`/api/stock/${articleId}`)).json()).quantite)).toBe(4);
});

test("le magasinier réceptionne le reste sans voir un seul prix", async ({ browser, request }) => {
  const { status, storageState } = await ouvrirSession(MAGASINIER);
  expect(status).toBe(200);
  const ctx = await browser.newContext({ storageState });
  const page = await ctx.newPage();
  await page.goto("/achats");
  await expect(page.getByTestId(`achat-${numero}`)).toBeVisible();
  await expect(page.getByText("25000")).toHaveCount(0);
  await expect(page.getByTestId("nouvel-achat")).toHaveCount(0);
  await page.getByTestId(`achat-${numero}`).getByRole("link", { name: "Voir" }).click();
  await expect(page.getByText("2500", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("payer")).toHaveCount(0);
  await expect(page.getByTestId("annuler-achat")).toHaveCount(0);
  await page.getByTestId("tout-recevoir").click();
  await page.getByTestId("valider-reception").click();
  await expect(page.getByTestId("badge-reception")).toContainText("Reçu");
  await page.goto("/achats/nouveau");
  await expect(page).not.toHaveURL(/\/achats\/nouveau/);
  await ctx.close();
  expect(Number((await (await request.get(`/api/stock/${articleId}`)).json()).quantite)).toBe(10);
});

test("le PDG paie : une dépense « Achats fournisseurs » apparaît ; l'achat ne peut plus être annulé", async ({ page, request }) => {
  await page.goto("/achats");
  await page.getByTestId(`achat-${numero}`).getByRole("link", { name: "Voir" }).click();
  await expect(page.getByTestId("badge-paiement")).toContainText("Non payé");
  await page.getByTestId("payer").click();
  await page.getByTestId("confirmer-paiement").click();
  await expect(page.getByTestId("badge-paiement")).toContainText("Payé");
  await expect(page.getByTestId("payer")).toHaveCount(0);

  const depenses = await (await request.get("/api/depenses?categorie=Achats%20fournisseurs")).json();
  const liee = depenses.data.find((d) => d.description?.includes(numero));
  expect(liee).toBeTruthy();
  expect(Number(liee.montant)).toBe(25000);

  await page.getByTestId("annuler-achat").click();
  await page.getByTestId("motif-annulation").fill("Test d'annulation");
  await page.getByTestId("confirmer-annulation").click();
  await expect(page.getByText("Une partie de la marchandise a déjà été reçue : l'achat ne peut plus être annulé.")).toBeVisible();
  expect((await (await request.get("/api/achats?statut=ANNULE")).json()).data.length).toBe(0);
  await expect(page.getByText("Une erreur inattendue")).toHaveCount(0);
});
