import { test, expect, request as pwRequest } from "@playwright/test";
import { PORT_API } from "../ports.js";
import { ETATS } from "../global-setup.js";
import { ouvrirSession } from "../session.js";

// Droits de la cliente sur ses données (7.4) : télécharger, fermer son compte avec mot de passe, puis l'atelier
// anonymise la fiche. La cliente est créée pour ce test (jamais celle des autres specs).
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

const TEL = "+221 77 555 01 02";
const IDENTIFIANT = "+221775550102";
const MDP = "Mot-de-passe-E2E-2026!";
let clienteId;

test("l'atelier crée la fiche et la cliente active son compte", async ({ request }) => {
  const c = await request.post("/api/clientes", { data: { nom: "Effacee", prenom: "Aminata", telephone: TEL } });
  expect(c.status()).toBe(201);
  clienteId = (await c.json()).id;
  const inv = await request.post(`/api/clientes/${clienteId}/inviter`);
  expect(inv.status()).toBe(201);
  const token = new URL((await inv.json()).lienActivation).searchParams.get("token");
  const anonyme = await pwRequest.newContext({ baseURL: `http://localhost:${PORT_API}`, extraHTTPHeaders: { "X-Forwarded-For": "10.88.1.1" } });
  const act = await anonyme.post("/api/auth/activer-compte-client", { data: { token, nouveauMotDePasse: MDP } });
  expect(act.status()).toBe(200);
  await anonyme.dispose();
});

test("la cliente voit le lien d'export, refuse un mauvais mot de passe, puis ferme son compte", async ({ browser }) => {
  const { status, storageState } = await ouvrirSession(IDENTIFIANT, MDP);
  expect(status).toBe(200);
  const ctx = await browser.newContext({ storageState });
  const page = await ctx.newPage();
  await page.goto("/client");
  await expect(page.getByTestId("export-donnees")).toHaveAttribute("href", "/api/moi/export");

  // L'export est un vrai fichier, avec ses données et seulement elles.
  const reponse = await ctx.request.get("/api/moi/export");
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()["content-disposition"]).toContain("attachment");
  expect((await reponse.json()).profil.nom).toBe("Effacee");

  await page.getByTestId("supprimer-compte").click();
  await page.getByTestId("supprimer-mdp").fill("mauvais-mot-de-passe");
  await page.getByTestId("supprimer-confirmer").click();
  await expect(page.getByText("Mot de passe incorrect.")).toBeVisible();
  await expect(page).toHaveURL(/\/client/);

  await page.getByTestId("supprimer-mdp").fill(MDP);
  await page.getByTestId("supprimer-confirmer").click();
  await page.waitForURL(/\/login/);
  await ctx.close();
});

test("le compte est bien fermé : reconnexion impossible", async () => {
  expect((await ouvrirSession(IDENTIFIANT, MDP)).status).toBe(401);
});

test("l'atelier voit la demande d'effacement, anonymise la fiche, et l'identité disparaît", async ({ page, request }) => {
  await page.goto("/clientes?effacement=true");
  await expect(page.getByText("Effacee Aminata").first()).toBeVisible();
  await expect(page.getByText("Effacement demandé").first()).toBeVisible();
  await page.getByRole("link", { name: "Voir" }).first().click();
  await expect(page.getByTestId("effacement-demande")).toBeVisible();

  await page.getByTestId("anonymiser-bouton").click();
  await page.getByTestId("anonymiser-confirmer").click();
  await expect(page.getByTestId("cliente-anonymisee")).toBeVisible();

  const fiche = await (await request.get(`/api/clientes/${clienteId}`)).json();
  expect(fiche.nom).toBe("Cliente");
  expect(fiche.telephone).not.toContain("5550102");
  expect(fiche.anonymiseeLe).toBeTruthy();
  await page.goto("/clientes?effacement=true");
  await expect(page.getByText("Effacee Aminata")).toHaveCount(0);
});
