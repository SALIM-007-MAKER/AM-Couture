import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";
import { MOT_DE_PASSE } from "../seed.js";
import { ouvrirSession } from "../session.js";

// Production : le PDG crée un employé couturier, lui affecte une commande depuis la fiche, puis l'employé la retrouve
// dans « Mes travaux » sans voir d'écran d'affectation ni de montant.
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

const IDENTIFIANT = "e2e-couturier-prod";
let numeroCommande;

test("le PDG crée un couturier et une commande à affecter", async ({ page, request }) => {
  await page.goto("/employes/nouveau");
  await page.getByLabel(/^Prénom/).fill("Moussa");
  await page.getByLabel(/^Nom \*/).fill("Couturier");
  await page.getByLabel(/^Identifiant de connexion/).fill(IDENTIFIANT);
  await page.getByLabel(/^Mot de passe initial/).fill(MOT_DE_PASSE);
  await page.getByTestId("select-poste").selectOption("COUTURIER");
  await page.getByTestId("enregistrer-employe").click();
  await expect(page.getByTestId(`employe-${IDENTIFIANT}`)).toBeVisible();

  // Commande (via l'API de la session du PDG : la création par formulaire est déjà couverte par pdg.spec.js).
  const clientes = await (await request.get("/api/clientes?q=Bintou")).json();
  const bintou = clientes.data.find((c) => c.prenom === "Bintou");
  const dateLivraison = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const res = await request.post("/api/commandes", {
    data: { clienteId: bintou.id, typeVetement: "ROBE", prixTotal: "25000", dateLivraisonPrevue: dateLivraison },
    headers: { "Idempotency-Key": `e2e-prod-${Date.now()}` },
  });
  expect(res.status()).toBe(201);
  numeroCommande = (await res.json()).numero;
});

test("le PDG affecte la commande depuis sa fiche", async ({ page }) => {
  await page.goto("/commandes");
  await page.locator("tr", { hasText: numeroCommande }).getByRole("link", { name: "Voir" }).click();
  await expect(page.getByTestId("section-affectation")).toContainText("Non affectée");
  await page.getByTestId("select-affectation").selectOption({ label: "Moussa Couturier" });
  await page.getByTestId("affecter").click();
  await expect(page.getByTestId("section-affectation")).toContainText("Confiée à Moussa Couturier");

  await page.goto("/production");
  await expect(page.getByTestId(`charge-${IDENTIFIANT}`)).toContainText("1");
  await expect(page.getByTestId("chiffre-non-affectees")).toBeVisible();
});

test.describe("session du couturier", () => {
  test("retrouve la commande dans « Mes travaux », sans écran de production ni montant", async ({ browser }) => {
    const { status, storageState } = await ouvrirSession(IDENTIFIANT);
    expect(status).toBe(200);
    const ctx = await browser.newContext({ storageState });
    const page = await ctx.newPage();
    await page.goto("/commandes");
    await expect(page).not.toHaveURL(/\/login/);

    await expect(page.getByRole("navigation").getByRole("link", { name: "Production" })).toHaveCount(0);
    await page.goto("/production");
    await expect(page).not.toHaveURL(/\/production$/);

    await page.goto("/commandes?assigneA=moi");
    await expect(page.getByText(numeroCommande).first()).toBeVisible();
    await expect(page.getByText("25000")).toHaveCount(0);

    await page.locator("tr", { hasText: numeroCommande }).getByRole("link", { name: "Voir" }).click();
    await expect(page.getByTestId("section-affectation")).toContainText("Confiée à Moussa Couturier");
    await expect(page.getByTestId("select-affectation")).toHaveCount(0);
    await expect(page.getByText("Une erreur inattendue")).toHaveCount(0);
    await ctx.close();
  });
});
