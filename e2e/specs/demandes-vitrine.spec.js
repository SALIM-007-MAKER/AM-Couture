import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Demande de commande depuis la vitrine : un visiteur SANS compte l'envoie (avec consentement), l'atelier la retrouve
// dans « Demandes », crée la fiche cliente, et peut ensuite la traiter comme n'importe quelle demande.
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

const SLUG = "atelier-e2e-demandes";
const MODELE = "Robe E2E Demande";
const TEL = "+221 77 123 45 67";
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mP8z8DwnwEJMDKgAaQRALp9Af9RNMN1AAAAAElFTkSuQmCC";
let modeleId;

test("le PDG publie un modèle et active la vitrine avec les demandes en ligne", async ({ page, request }) => {
  const m = await request.post("/api/modeles", { data: { nom: MODELE, categorie: "ROBE" } });
  modeleId = (await m.json()).id;
  expect((await request.post(`/api/modeles/${modeleId}/photos`, { data: { image: `data:image/png;base64,${PNG_B64}` } })).status()).toBe(201);
  expect((await request.patch(`/api/modeles/${modeleId}`, { data: { publie: true } })).status()).toBe(200);

  await page.goto("/vitrine");
  await page.getByTestId("vitrine-slug").fill(SLUG);
  await page.getByTestId("vitrine-active").check();
  await page.getByTestId("vitrine-demandes").check();
  await page.getByTestId("enregistrer-vitrine").click();
  await expect(page.getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible();
});

test("un visiteur envoie sa demande : consentement obligatoire, erreur claire, puis confirmation", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto(`/a/${SLUG}`);
  await page.getByTestId(`modele-${MODELE}`).click();
  await page.getByTestId("demander-modele").click();
  const form = page.getByTestId("demande-form");
  await expect(form).toContainText(MODELE);

  // Sans consentement, l'envoi est impossible.
  await page.getByTestId("demande-prenom").fill("Mariama");
  await page.getByTestId("demande-nom").fill("Visiteuse");
  await page.getByTestId("demande-telephone").fill("abc");
  await expect(page.getByTestId("demande-envoyer")).toBeDisabled();
  await page.getByTestId("demande-consentement").check();
  await page.getByTestId("demande-envoyer").click();
  await expect(page.getByTestId("demande-erreur")).toBeVisible(); // numéro invalide : message du serveur, pas d'écran d'erreur
  await expect(page.getByText("Une erreur inattendue")).toHaveCount(0);

  await page.getByTestId("demande-telephone").fill(TEL);
  await page.getByTestId("demande-message").fill("Pour un mariage en mars.");
  await page.getByTestId("demande-envoyer").click();
  await expect(page.getByTestId("demande-envoyee")).toBeVisible();
  expect(page.url()).not.toContain("/login");
  await ctx.close();
});

test("l'atelier retrouve la demande, crée la fiche cliente, puis peut l'accepter", async ({ page, request }) => {
  await page.goto("/demandes");
  await page.getByText("Visiteuse Mariama").first().click();
  await expect(page.getByTestId("rattacher-cliente")).toBeVisible();
  await expect(page.getByTestId("demande-telephone")).toContainText("+221771234567");
  await expect(page.getByText("Pour un mariage en mars.")).toBeVisible();
  await expect(page.getByText("Accepter et lier")).toHaveCount(0); // pas avant la fiche cliente

  await page.getByTestId("creer-fiche").click();
  await expect(page.getByTestId("rattacher-cliente")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Voir la fiche client" })).toBeVisible();
  await expect(page.getByText("Accepter et lier")).toBeVisible();

  // La fiche existe réellement dans les clientes, une seule fois.
  const clientes = await (await request.get("/api/clientes?q=Visiteuse")).json();
  expect(clientes.data.filter((c) => c.telephone === "+221771234567")).toHaveLength(1);
});

test("nettoyage : modèle dépublié, vitrine fermée (aucune page publique ne reste ouverte)", async ({ page, request, browser }) => {
  expect((await request.patch(`/api/modeles/${modeleId}`, { data: { publie: false } })).status()).toBe(200);
  await page.goto("/vitrine");
  await page.getByTestId("vitrine-active").uncheck();
  await page.getByTestId("vitrine-demandes").uncheck();
  await page.getByTestId("enregistrer-vitrine").click();
  await expect(page.getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible();
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const visiteur = await ctx.newPage();
  await visiteur.goto(`/a/${SLUG}`);
  await expect(visiteur.getByTestId("vitrine-introuvable")).toBeVisible();
  await ctx.close();
});
