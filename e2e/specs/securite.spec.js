import { test, expect, request } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Protections de l'API vues depuis un navigateur authentifié (cookie de session réel) : permissions par rôle,
// isolation entre ateliers, garde d'origine (CSRF). Les mêmes règles sont testées plus finement dans
// backend/src/integration-tests ; ici on vérifie qu'elles tiennent de bout en bout, derrière le proxy du frontend.

async function contexte(baseURL, etat) {
  return request.newContext({ baseURL, storageState: etat });
}
const base = "http://localhost:5173";

test("sans session : 401 sur les routes protégées", async () => {
  const api = await request.newContext({ baseURL: base });
  for (const chemin of ["/api/clientes", "/api/commandes", "/api/auth/me", "/api/ateliers"]) {
    expect((await api.get(chemin)).status(), chemin).toBe(401);
  }
  await api.dispose();
});

test("le PDG ne peut pas administrer la plateforme (403)", async () => {
  const api = await contexte(base, ETATS.pdg);
  expect((await api.get("/api/ateliers")).status()).toBe(403);
  await api.dispose();
});

test("la cliente finale ne peut lire aucune donnée de gestion (403)", async () => {
  const api = await contexte(base, ETATS.client);
  for (const chemin of ["/api/clientes", "/api/commandes", "/api/paiements", "/api/depenses"]) {
    expect((await api.get(chemin)).status(), chemin).toBe(403);
  }
  await api.dispose();
});

test("le SUPERADMIN n'a pas accès aux données métier d'un atelier (403)", async () => {
  const api = await contexte(base, ETATS.superadmin);
  for (const chemin of ["/api/clientes", "/api/commandes"]) {
    expect((await api.get(chemin)).status(), chemin).toBe(403);
  }
  await api.dispose();
});

test("isolation : le PDG d'Alpha ne peut lire ni la commande ni la cliente de Beta (404)", async () => {
  const api = await contexte(base, ETATS.pdg);
  const cmd = await api.get(`/api/commandes/${process.env.E2E_COMMANDE_BETA_ID}`);
  expect(cmd.status()).toBe(404);
  expect(await cmd.text()).not.toContain("99999");
  expect((await api.get(`/api/clientes/${process.env.E2E_CLIENTE_BETA_ID}`)).status()).toBe(404);

  const liste = await (await api.get("/api/commandes")).text();
  expect(liste).not.toContain("E2E-BETA-001");
  await api.dispose();
});

test("isolation : le PDG d'Alpha ne peut pas écrire dans une commande de Beta", async () => {
  const api = await contexte(base, ETATS.pdg);
  const res = await api.post(`/api/commandes/${process.env.E2E_COMMANDE_BETA_ID}/paiements`, {
    data: { montant: "1000", mode: "ESPECES" },
  });
  expect(res.status()).toBe(404);
  await api.dispose();
});

test("garde d'origine : une écriture venant d'un autre site est refusée (403)", async () => {
  const api = await contexte(base, ETATS.pdg);
  const res = await api.post("/api/clientes", {
    headers: { Origin: "https://site-malveillant.example" },
    data: { nom: "Pirate", prenom: "X", telephone: "92222222" },
  });
  expect(res.status()).toBe(403);
  await api.dispose();
});

test("une réponse d'erreur serveur ne divulgue ni SQL ni pile", async () => {
  const api = await contexte(base, ETATS.pdg);
  const res = await api.post("/api/clientes", { headers: { "Content-Type": "application/json" }, data: "{pas du json" });
  expect(res.status()).toBe(400);
  const texte = await res.text();
  expect(texte).not.toMatch(/prisma|select |syntaxerror|at .*\.js/i);
  await api.dispose();
});
