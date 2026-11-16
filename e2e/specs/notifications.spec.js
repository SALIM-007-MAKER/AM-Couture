import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";
import { MOT_DE_PASSE } from "../seed.js";
import { ouvrirSession } from "../session.js";

// Notifications automatiques : le couturier est prévenu du travail qui lui est confié (et lui seul) ; le PDG voit le
// stock bas ; marquer lu est individuel pour un employé et la suppression reste au PDG.
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

const COUTURIER = "e2e-couturier-notif";
const ARTICLE = "Fil E2E Notifications";
let numeroCommande;

test("préparation : couturier, commande confiée, article en stock bas", async ({ request }) => {
  const emp = await request.post("/api/employes", {
    data: { identifiant: COUTURIER, password: MOT_DE_PASSE, prenom: "Aminata", nom: "Couturière", poste: "COUTURIER" },
    headers: { "Idempotency-Key": `e2e-notif-emp-${Date.now()}` },
  });
  expect(emp.status()).toBe(201);
  const employeId = (await emp.json()).id;

  // Cliente dédiée (avec mesures) : les autres specs retrouvent leurs lignes par nom de cliente, ne pas les multiplier.
  const cl = await request.post("/api/clientes", { data: { nom: "Notifs", prenom: "Cliente", telephone: "90555551" } });
  expect(cl.status()).toBe(201);
  const cliente = await cl.json();
  expect((await request.post(`/api/clientes/${cliente.id}/mesures`, { data: { poitrine: "90", taille: "70", hanches: "95" } })).status()).toBe(201);
  const dateLivraison = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
  const cmd = await request.post("/api/commandes", {
    data: { clienteId: cliente.id, typeVetement: "ROBE", prixTotal: "15000", dateLivraisonPrevue: dateLivraison },
    headers: { "Idempotency-Key": `e2e-notif-cmd-${Date.now()}` },
  });
  expect(cmd.status()).toBe(201);
  const commande = await cmd.json();
  numeroCommande = commande.numero;
  expect((await request.put(`/api/commandes/${commande.id}/affectation`, { data: { employeId } })).status()).toBe(200);

  const article = await request.post("/api/stock", { data: { nom: ARTICLE, unite: "PIECE", seuilAlerte: "5", quantiteInitiale: "2" } });
  expect(article.status()).toBe(201);
});

test("le PDG voit le stock bas, pas le travail confié à l'employé", async ({ page }) => {
  await page.goto("/notifications");
  const stock = page.getByTestId("notif-STOCK_BAS").filter({ hasText: ARTICLE });
  await expect(stock).toBeVisible();
  await expect(stock).toContainText("2");
  await expect(page.getByTestId("notif-TACHE_AFFECTEE")).toHaveCount(0);
  await expect(page.getByText("Une erreur inattendue")).toHaveCount(0);
});

test("le couturier est prévenu de son travail, le marque lu pour lui seul et ne peut rien supprimer", async ({ browser, page }) => {
  const { status, storageState } = await ouvrirSession(COUTURIER);
  expect(status).toBe(200);
  const ctx = await browser.newContext({ storageState });
  const emp = await ctx.newPage();
  await emp.goto("/notifications");
  const tache = emp.getByTestId("notif-TACHE_AFFECTEE");
  await expect(tache).toBeVisible();
  await expect(tache).toContainText(numeroCommande);
  await expect(emp.getByTestId("notif-STOCK_BAS")).toHaveCount(0); // pas de gestion de stock
  await expect(emp.getByText("25000")).toHaveCount(0);

  await emp.getByRole("button", { name: "Marquer lue" }).first().click();
  await expect(emp.getByRole("button", { name: "Marquer non lue" })).toBeVisible();

  // Sélectionner une notification : aucune action de suppression n'est proposée à un employé.
  await emp.getByLabel("Sélectionner cette notification").first().check();
  await expect(emp.getByRole("button", { name: "Marquer comme lues" })).toBeVisible();
  await expect(emp.getByRole("button", { name: "Supprimer" })).toHaveCount(0);
  await ctx.close();

  // Le PDG, lui, garde sa propre vue et peut supprimer.
  await page.goto("/notifications");
  await page.getByLabel("Sélectionner cette notification").first().check();
  await expect(page.getByRole("button", { name: "Supprimer" })).toBeVisible();
});
