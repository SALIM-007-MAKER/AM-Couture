import { test, expect, request as pwRequest } from "@playwright/test";
import { ETATS } from "../global-setup.js";
import { MOT_DE_PASSE } from "../seed.js";
import { ouvrirSession } from "../session.js";
import { PORT_API } from "../ports.js";

// Tableau de bord complet d'une réceptionniste (poste RECEPTIONNISTE : dashboard.lire + commandes.lire, SANS rapports.lire
// ni finances.voir). Ses trois zones — compteur « Livraison ≤ 3 j », « Commandes en retard », « Livraison dans 3 jours » —
// viennent de /api/dashboard/commandes/* ; les routes générales /api/rapports/* lui restent fermées (403) ; aucun montant
// n'est exposé ; aucune commande d'un autre atelier n'apparaît.
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

const IDENTIFIANT = "e2e-recep-tableau";
const jour = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const PRIX_DISTINCTIF = "73519"; // aucun écran d'une personne sans finances.voir ne doit l'afficher
const numeros = {};

test("préparation : une réceptionniste, des commandes en retard, à livrer bientôt, à livrer plus tard et annulée", async ({ request }) => {
  const res = await request.post("/api/employes", {
    data: { identifiant: IDENTIFIANT, password: MOT_DE_PASSE, prenom: "Rita", nom: "Tableau", poste: "RECEPTIONNISTE" },
  });
  expect(res.status(), await res.text()).toBe(201);

  const clientes = await (await request.get("/api/clientes?q=Bintou")).json();
  const bintou = clientes.data.find((c) => c.prenom === "Bintou");
  const creer = async (cle, dateCommande, dateLivraisonPrevue) => {
    const r = await request.post("/api/commandes", {
      data: { clienteId: bintou.id, typeVetement: "ROBE", prixTotal: PRIX_DISTINCTIF, ...(dateCommande ? { dateCommande } : {}), dateLivraisonPrevue },
      headers: { "Idempotency-Key": `e2e-recep-tableau-${cle}-${Date.now()}` },
    });
    expect(r.status(), `${cle} : ${await r.text()}`).toBe(201);
    numeros[cle] = (await r.json()).numero;
    return (await r.json()).id;
  };
  // Très anciennes : elles sont en tête de la liste « en retard » (la plus en retard d'abord), quels que soient les autres tests.
  await creer("retardA", jour(-120), jour(-90));
  await creer("retardB", jour(-120), jour(-80));
  await creer("bientotA", null, jour(1));
  await creer("bientotB", null, jour(2));
  await creer("tard", null, jour(30));
  // Une commande dont la date est dépassée mais qui est annulée (statut clos) n'est plus « en retard ».
  const close = await creer("retardLivree", jour(-120), jour(-100));
  const s = await request.post(`/api/commandes/${close}/statut`, { data: { statut: "ANNULEE" }, headers: { "Idempotency-Key": `e2e-recep-tableau-annul-${Date.now()}` } });
  expect(s.status(), `annulation : ${await s.text()}`).toBeLessThan(300);
});

test.describe("session de la réceptionniste", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("les trois zones du tableau de bord s'affichent, sans 403 ni erreur, sans aucun montant", async ({ browser, request }) => {
    const { status, storageState } = await ouvrirSession(IDENTIFIANT);
    expect(status).toBe(200);
    const ctx = await browser.newContext({ storageState });
    const page = await ctx.newPage();
    const refus = [];
    const reponses = [];
    page.on("response", async (r) => {
      const u = new URL(r.url());
      if (!u.pathname.startsWith("/api/")) return;
      if (r.status() >= 400) refus.push(`${r.status()} ${u.pathname}`);
      if (u.pathname.startsWith("/api/dashboard/commandes/")) reponses.push({ chemin: u.pathname, statut: r.status(), corps: await r.text().catch(() => "") });
    });

    await page.goto("/tableau-de-bord");
    await expect(page.getByRole("heading", { name: "Tableau de bord" }).first()).toBeVisible();

    // Zone 1 — commandes en retard : les plus en retard d'abord, avec les jours de retard ; l'annulée n'y est pas.
    await expect(page.getByText(numeros.retardA).first()).toBeVisible();
    await expect(page.getByText(numeros.retardB).first()).toBeVisible();
    await expect(page.getByText("90 j de retard")).toBeVisible();
    await expect(page.getByText("80 j de retard")).toBeVisible();
    // (L'annulée figure dans « Commandes récentes », qui montre tous les statuts : on vérifie donc la réponse de la liste.)
    const enRetardApi = reponses.find((x) => x.chemin.endsWith("/en-retard"));
    expect(enRetardApi?.statut).toBe(200);
    expect(enRetardApi.corps).not.toContain(numeros.retardLivree);
    expect(enRetardApi.corps).toContain(numeros.retardA);
    await expect(page.getByText("Commandes en retard", { exact: true })).toBeVisible();

    // Zone 2 — livraisons dans 3 jours : celles d'aujourd'hui à +2 jours, pas celle de +30 jours.
    await expect(page.getByText("Livraison dans 3 jours", { exact: true })).toBeVisible();
    await expect(page.getByText(numeros.bientotA).first()).toBeVisible();
    await expect(page.getByText(numeros.bientotB).first()).toBeVisible();
    const aLivrerApi = reponses.find((x) => x.chemin.endsWith("/a-livrer"));
    expect(aLivrerApi.corps).not.toContain(numeros.tard);
    expect(aLivrerApi.corps).toContain(numeros.bientotA);

    // Zone 3 — compteur « Livraison ≤ 3 j » : un nombre (pas « — »), égal au total renvoyé par l'API du tableau de bord.
    expect(aLivrerApi.statut).toBe(200);
    const total = JSON.parse(aLivrerApi.corps).meta.total;
    expect(total).toBeGreaterThanOrEqual(2);
    const carte = page.getByText("Livraison ≤ 3 j", { exact: true }).locator("xpath=..");
    await expect(carte).toContainText(String(total));
    await expect(carte).not.toContainText("—");
    await expect(page.getByText("En retard", { exact: true }).first()).toBeVisible();

    // Aucun 403 ni autre refus, aucun message d'erreur.
    expect(refus, `requêtes refusées : ${refus.join(", ")}`).toEqual([]);
    await expect(page.getByText(/Réservé aux|Accès refusé|Une erreur est survenue/i)).toHaveCount(0);
    expect(reponses.map((x) => x.chemin).sort()).toEqual(["/api/dashboard/commandes/a-livrer", "/api/dashboard/commandes/en-retard"]);

    // Masquage des montants : ni à l'écran ni dans les réponses API.
    await expect(page.getByText(PRIX_DISTINCTIF)).toHaveCount(0);
    for (const r of reponses) {
      expect(r.corps, `${r.chemin}`).not.toContain("prixTotal");
      expect(r.corps).not.toContain(PRIX_DISTINCTIF);
    }
    await ctx.close();
  });

  test("les routes générales Rapports lui restent fermées (403), les routes du tableau de bord sont ouvertes (200)", async () => {
    const { status, storageState } = await ouvrirSession(IDENTIFIANT);
    expect(status).toBe(200);
    const api = await pwRequest.newContext({ baseURL: `http://localhost:${PORT_API}`, storageState });
    try {
      for (const url of ["/api/rapports/commandes/en-retard", "/api/rapports/commandes/a-livrer", "/api/rapports/commandes", "/api/rapports/finances", "/api/rapports/evolution"]) {
        expect((await api.get(url)).status(), url).toBe(403);
      }
      for (const url of ["/api/dashboard/commandes/en-retard", "/api/dashboard/commandes/a-livrer?horizonJours=3"]) {
        expect((await api.get(url)).status(), url).toBe(200);
      }
    } finally {
      await api.dispose();
    }
  });

  test("isolation : aucune commande ni cliente d'un autre atelier dans ses listes, même sur 90 jours", async () => {
    const { storageState } = await ouvrirSession(IDENTIFIANT);
    const api = await pwRequest.newContext({ baseURL: `http://localhost:${PORT_API}`, storageState });
    try {
      // La commande de l'atelier Beta est livrable dans 10 jours : elle apparaîtrait ici s'il y avait une fuite.
      const livrer = await (await api.get("/api/dashboard/commandes/a-livrer?horizonJours=90&pageSize=100")).text();
      const retard = await (await api.get("/api/dashboard/commandes/en-retard?pageSize=100")).text();
      for (const corps of [livrer, retard]) {
        expect(corps).not.toContain("E2E-BETA-001");
        expect(corps).not.toContain("Secrète");
      }
      expect(livrer).toContain("E2E-ALPHA-001"); // sa propre commande, elle, y est
    } finally {
      await api.dispose();
    }
  });
});

test("sans commandes.lire : les nouvelles routes sont refusées (403), et pour le PDG elles sont identiques à celles de Rapports", async ({ request }) => {
  const res = await request.post("/api/employes", {
    data: { identifiant: "e2e-recep-sans-commandes", password: MOT_DE_PASSE, prenom: "Sans", nom: "Commandes", poste: "AUTRE", permissions: ["dashboard.lire"] },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { status, storageState } = await ouvrirSession("e2e-recep-sans-commandes");
  expect(status).toBe(200);
  const api = await pwRequest.newContext({ baseURL: `http://localhost:${PORT_API}`, storageState });
  try {
    expect((await api.get("/api/dashboard/commandes/en-retard")).status()).toBe(403);
    expect((await api.get("/api/dashboard/commandes/a-livrer")).status()).toBe(403);
  } finally {
    await api.dispose();
  }
  // PDG : mêmes données par l'ancienne et la nouvelle route (le PDG voit les montants).
  const neuf = await (await request.get("/api/dashboard/commandes/en-retard?pageSize=3")).json();
  const ancien = await (await request.get("/api/rapports/commandes/en-retard?pageSize=3")).json();
  expect(neuf.data.map((c) => c.id)).toEqual(ancien.data.map((c) => c.id));
  expect(neuf.data[0]).toHaveProperty("prixTotal");
});
