import { test, expect, request as pwRequest } from "@playwright/test";
import fs from "node:fs";
import { PORT_API, PORT_WEB } from "../ports.js";

// Authentification en développement local (sans clé Resend) : inscription → lien de vérification d'email, mot de passe
// oublié → lien de réinitialisation. Les liens sont écrits dans le journal de l'API de test (jamais dans la réponse HTTP) ;
// le lien pointe vers l'écran (frontend), pas vers l'API. Usage unique, ancien mot de passe refusé après réinitialisation.
// Le comportement de production (envoi par Resend) est couvert par les tests d'intégration (emails.test.js), pas ici.
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "serial" });

const JOURNAL = new URL("../../e2e-journal/api.log", import.meta.url);
const EMAIL = `e2e-auth-locale-${Date.now()}@exemple.test`;
const MDP = "Passe-e2e-123";
const NOUVEAU_MDP = "Nouveau-passe-e2e-456";

/** Dernier lien écrit dans le journal pour ce libellé et cet identifiant (attend qu'il apparaisse). */
async function lienDuJournal(libelle) {
  let lien;
  await expect
    .poll(
      () => {
        const texte = fs.readFileSync(JOURNAL, "utf8");
        const blocs = texte.split("[DEV LOCAL]").filter((b) => b.includes(libelle) && b.includes(EMAIL));
        const dernier = blocs[blocs.length - 1];
        lien = dernier?.match(/https?:\/\/\S+/)?.[0];
        return Boolean(lien);
      },
      { timeout: 10_000, message: `lien « ${libelle} » introuvable dans le journal de l'API` },
    )
    .toBe(true);
  return lien;
}

/** Contexte API direct avec une IP de test propre (limiteurs de débit conservés, voir session.js). */
async function apiNeuve(ip, entetes = {}) {
  return pwRequest.newContext({ baseURL: `http://localhost:${PORT_API}`, extraHTTPHeaders: { "X-Forwarded-For": ip, ...entetes } });
}

test("inscription : la réponse ne contient aucun lien ; le lien de vérification est dans le journal et mène à l'écran", async () => {
  // Derrière le proxy de Vite, l'en-tête Host est celui de l'API mais Origin reste celui de la page : on le reproduit.
  const api = await apiNeuve("10.88.1.1", { Origin: `http://localhost:${PORT_WEB}` });
  const res = await api.post("/api/auth/inscription-atelier", {
    data: { nom: "Atelier Auth Locale", prenom: "Aïcha", nomProprietaire: "Locale", email: EMAIL, adminPassword: MDP, telephone: "90001234", devise: "FCFA" },
  });
  expect(res.status(), await res.text()).toBe(201);
  expect(await res.text()).not.toMatch(/token|verifier-email/i);
  await api.dispose();

  const lien = await lienDuJournal("vérification");
  expect(new URL(lien).port).toBe(String(PORT_WEB)); // l'écran, pas l'API derrière le proxy
  expect(new URL(lien).pathname).toBe("/verifier-email");
});

test("le lien de vérification fonctionne dans le navigateur, une seule fois", async ({ page, browser }) => {
  const lien = await lienDuJournal("vérification");
  const chemin = new URL(lien);
  await page.goto(`${chemin.pathname}${chemin.search}`);
  await expect(page.getByText("Email confirmé avec succès.")).toBeVisible();
  await expect(page.getByRole("img", { name: /Tailora/ }).first()).toBeVisible();

  // Second usage : refusé.
  const autre = await browser.newPage();
  await autre.goto(`${chemin.pathname}${chemin.search}`);
  await expect(autre.getByText("Email confirmé avec succès.")).toHaveCount(0);
  await autre.close();
});

test("mot de passe oublié : réponse générique, lien dans le journal, nouveau mot de passe, lien à usage unique", async ({ page }) => {
  const api = await apiNeuve("10.88.1.2", { Origin: `http://localhost:${PORT_WEB}` });
  const res = await api.post("/api/auth/mot-de-passe-oublie", { data: { identifiant: EMAIL } });
  expect(res.status()).toBe(200);
  expect(await res.text()).not.toMatch(/token|reinitialiser-mot-de-passe\?/i);
  // Même réponse pour un identifiant inconnu (aucune énumération de comptes).
  const inconnu = await api.post("/api/auth/mot-de-passe-oublie", { data: { identifiant: "inconnu-e2e-xyz" } });
  expect(await inconnu.text()).toBe(await (await api.post("/api/auth/mot-de-passe-oublie", { data: { identifiant: EMAIL } })).text());
  await api.dispose();

  const lien = await lienDuJournal("réinitialisation");
  const u = new URL(lien);
  expect(u.pathname).toBe("/reinitialiser-mot-de-passe");
  await page.goto(`${u.pathname}${u.search}`);
  await page.getByPlaceholder("8 caractères minimum").fill(NOUVEAU_MDP);
  await page.getByLabel("Confirmer le mot de passe").fill(NOUVEAU_MDP);
  await page.getByRole("button", { name: "Réinitialiser" }).click();
  await expect(page).toHaveURL(/\/login/);

  // Le même lien ne sert qu'une fois.
  const verifie = await apiNeuve("10.88.1.3");
  const reuse = await verifie.post("/api/auth/reinitialiser-mot-de-passe-token", { data: { token: u.searchParams.get("token"), nouveauMotDePasse: "Encore-un-passe-789" } });
  expect(reuse.status()).toBe(400);

  // Ancien mot de passe refusé, nouveau accepté.
  expect((await verifie.post("/api/auth/login", { data: { identifiant: EMAIL, password: MDP } })).status()).toBe(401);
  expect((await verifie.post("/api/auth/login", { data: { identifiant: EMAIL, password: NOUVEAU_MDP } })).status()).toBe(200);
  await verifie.dispose();
});
