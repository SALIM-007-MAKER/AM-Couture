import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Écritures hors connexion (7.6). Le serveur injoignable est simulé en coupant les appels /api.
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

const sel = (page, nom) => page.getByRole("button", { name: nom });
const unique = () => `${Date.now()}`.slice(-7);

// Données propres à chaque test (cliente + mesure + commande) pour ne rien partager avec les autres specs.
async function preparerCommande(request) {
  const tel = `9${unique()}`;
  const c = await request.post("/api/clientes", { data: { nom: `Hl${tel}`, prenom: "Cmd", telephone: tel } });
  const cliente = await c.json();
  await request.post(`/api/clientes/${cliente.id}/mesures`, { data: { taille: "70" } });
  const dans10 = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const r = await request.post("/api/commandes", { data: { clienteId: cliente.id, typeVetement: "ROBE", prixTotal: 10000, dateLivraisonPrevue: dans10 } });
  expect(r.status()).toBe(201);
  return { cliente, commande: await r.json() };
}

test("avance de statut hors connexion : en attente, puis appliquée au retour du serveur", async ({ page, context, request }) => {
  const { commande } = await preparerCommande(request);
  await page.goto(`/commandes/${commande.id}`);
  await expect(sel(page, /Passer à « En confection »/)).toBeVisible();

  await context.route("**/api/**", (route) => route.abort());
  await sel(page, /Passer à « En confection »/).click();
  await expect(page.getByTestId("file-ecritures")).toContainText("1 modification(s) en attente");
  // Pas de deuxième avance empilée sur un statut que personne n'a vu.
  await expect(page.getByTestId("statut-en-attente")).toBeVisible();

  await context.unroute("**/api/**");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByTestId("file-ecritures")).toHaveCount(0, { timeout: 15_000 });
  const apres = await (await request.get(`/api/commandes/${commande.id}`)).json();
  expect(apres.statut).toBe("EN_CONFECTION");
});

test("conflit : le statut a changé entre-temps, rien n'est écrasé et le refus est expliqué", async ({ page, context, request }) => {
  const { commande } = await preparerCommande(request);
  await page.goto(`/commandes/${commande.id}`);
  await expect(sel(page, /Passer à « En confection »/)).toBeVisible();

  await context.route("**/api/**", (route) => route.abort());
  await sel(page, /Passer à « En confection »/).click();
  await expect(page.getByTestId("file-ecritures")).toContainText("1 modification(s) en attente");

  // Pendant ce temps, quelqu'un d'autre (autre appareil) annule la commande.
  const autre = await request.post(`/api/commandes/${commande.id}/statut`, { data: { statut: "ANNULEE" } });
  expect(autre.status()).toBe(200);

  await context.unroute("**/api/**");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  const element = page.getByTestId("file-element");
  await expect(element).toHaveAttribute("data-etat", "conflit", { timeout: 15_000 });
  await expect(element).toContainText("a changé entre-temps");
  expect((await (await request.get(`/api/commandes/${commande.id}`)).json()).statut).toBe("ANNULEE"); // non écrasé

  // L'utilisateur tranche : abandonner.
  await element.getByRole("button", { name: "Abandonner" }).click();
  await expect(page.getByTestId("file-ecritures")).toHaveCount(0);
});

test("réponse perdue : la requête a atteint le serveur, le rejeu ne crée PAS de doublon", async ({ page, context, request }) => {
  const tel = `9${unique()}`;
  await page.goto("/clientes/nouvelle");
  await page.getByLabel(/^Nom \*/).fill(`Perdue${tel}`);
  await page.getByLabel(/^Prénom \*/).fill("Reponse");
  await page.getByLabel(/^Téléphone \*/).fill(tel);
  // Le serveur reçoit et traite la requête, mais la réponse n'arrive jamais à l'application.
  await context.route("**/api/clientes", async (route) => {
    if (route.request().method() === "POST") {
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByTestId("file-ecritures")).toContainText("1 modification(s) en attente");
  const avant = await (await request.get(`/api/clientes?q=${tel}`)).json();
  expect(avant.data.filter((c) => c.telephone === tel)).toHaveLength(1); // déjà créée côté serveur

  await context.unroute("**/api/clientes");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByTestId("file-ecritures")).toHaveCount(0, { timeout: 15_000 });
  const apres = await (await request.get(`/api/clientes?q=${tel}`)).json();
  expect(apres.data.filter((c) => c.telephone === tel)).toHaveLength(1);
});

test("un paiement n'est jamais mis en attente : il échoue tout de suite, rien n'est envoyé au retour", async ({ page, context, request }) => {
  const { commande } = await preparerCommande(request);
  await page.goto(`/commandes/${commande.id}`);
  await expect(page.getByText(/Paiements?/).first()).toBeVisible();
  await context.route("**/api/**", (route) => route.abort());
  await page.getByLabel(/^Montant/).first().fill("1500");
  await page.getByRole("button", { name: /Enregistrer le paiement|Ajouter le paiement|Enregistrer/ }).first().click();
  await expect(page.getByText(/connexion|répondu/i).first()).toBeVisible();
  await expect(page.getByTestId("file-ecritures")).toHaveCount(0);

  await context.unroute("**/api/**");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(2000);
  const paiements = await (await request.get(`/api/commandes/${commande.id}/paiements`)).json();
  expect(paiements.data ?? paiements).toHaveLength(0);
});

test("la déconnexion supprime la file d'attente de l'appareil", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ETATS.pdg });
  const p = await ctx.newPage();
  await p.goto("/clientes");
  await expect(p.getByText("Alpha Awa").first()).toBeVisible();
  await ctx.route("**/api/**", (route) => route.abort());
  await p.getByRole("link", { name: /Nouveau client/ }).first().click();
  await p.getByLabel(/^Nom \*/).fill("Deco");
  await p.getByLabel(/^Prénom \*/).fill("File");
  await p.getByLabel(/^Téléphone \*/).fill(`9${unique()}`);
  await p.getByRole("button", { name: "Enregistrer" }).click();
  await expect(p.getByTestId("file-ecritures")).toBeVisible();
  const lireFile = () =>
    p.evaluate(
      () =>
        new Promise((resolve) => {
          const o = indexedDB.open("am-couture-file", 1);
          o.onupgradeneeded = () => o.result.createObjectStore("kv");
          o.onerror = () => resolve(null);
          o.onsuccess = () => {
            const db = o.result;
            const g = db.transaction("kv", "readonly").objectStore("kv").get("file");
            g.onsuccess = () => (db.close(), resolve(g.result ?? null));
          };
        }),
    );
  expect((await lireFile()).length).toBe(1);
  await ctx.unroute("**/api/**");
  await p.getByRole("button", { name: "Déconnexion" }).first().click();
  await p.waitForURL(/\/login/);
  await expect.poll(lireFile, { timeout: 5_000 }).toBeNull();
  await ctx.close();
});
