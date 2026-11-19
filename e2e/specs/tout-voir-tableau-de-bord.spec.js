import { test, expect, request as pwRequest } from "@playwright/test";
import { ETATS } from "../global-setup.js";
import { MOT_DE_PASSE } from "../seed.js";
import { ouvrirSession } from "../session.js";
import { PORT_API } from "../ports.js";

// Liens « Tout voir » des deux listes du tableau de bord (commandes en retard, livraisons à venir) :
// - réceptionniste (dashboard.lire + commandes.lire, SANS rapports.lire) : vers la liste des commandes, filtrée, qu'elle a le
//   droit de lire — jamais vers /rapports, qui lui est fermé ;
// - PDG et profils avec rapports.lire (comptable) : comportement historique, vers /rapports.
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

const RECEP = "e2e-tv-recep";
const COMPTA = "e2e-tv-compta";
const jour = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const numeros = {};

const carte = (page, titre) => page.getByRole("heading", { name: titre, exact: true }).locator("xpath=..");
const toutVoir = (page, titre) => carte(page, titre).getByRole("link", { name: /Tout voir/ });

/** Écoute les réponses d'API refusées (statut ≥ 400) sur une page. */
function surveillerRefus(page) {
  const refus = [];
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/") && r.status() >= 400) refus.push(`${r.status()} ${u.pathname}`);
  });
  return refus;
}

test("préparation : une réceptionniste, un comptable, des commandes en retard et à livrer bientôt", async ({ request }) => {
  for (const [identifiant, poste] of [[RECEP, "RECEPTIONNISTE"], [COMPTA, "COMPTABLE"]]) {
    const res = await request.post("/api/employes", {
      data: { identifiant, password: MOT_DE_PASSE, prenom: "Tout", nom: "Voir", poste, confirmationMotDePasse: MOT_DE_PASSE },
    });
    expect(res.status(), `${identifiant} : ${await res.text()}`).toBe(201);
  }
  const clientes = await (await request.get("/api/clientes?q=Bintou")).json();
  const bintou = clientes.data.find((c) => c.prenom === "Bintou");
  const creer = async (cle, dateCommande, dateLivraisonPrevue) => {
    const r = await request.post("/api/commandes", {
      data: { clienteId: bintou.id, typeVetement: "ROBE", prixTotal: "20000", ...(dateCommande ? { dateCommande } : {}), dateLivraisonPrevue },
      headers: { "Idempotency-Key": `e2e-tout-voir-${cle}-${Date.now()}` },
    });
    expect(r.status(), `${cle} : ${await r.text()}`).toBe(201);
    numeros[cle] = (await r.json()).numero;
  };
  await creer("retard", jour(-200), jour(-150));
  await creer("bientot", null, jour(1));
  await creer("tard", null, jour(40)); // hors de la fenêtre de 3 jours
});

test.describe("réceptionniste : les liens mènent à des pages qu'elle peut lire", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("« Commandes en retard » → liste des commandes filtrée sur le retard", async ({ browser }) => {
    const { status, storageState } = await ouvrirSession(RECEP);
    expect(status).toBe(200);
    const ctx = await browser.newContext({ storageState });
    const page = await ctx.newPage();
    const refus = surveillerRefus(page);

    await page.goto("/tableau-de-bord");
    await expect(page.getByText(numeros.retard).first()).toBeVisible();
    const lien = toutVoir(page, "Commandes en retard");
    await expect(lien).toHaveAttribute("href", "/commandes?enRetard=true");
    await lien.click();

    await expect(page).toHaveURL(/\/commandes\?enRetard=true$/);
    await expect(page.getByTestId("filtre-retard")).toBeChecked();
    await expect(page.getByText(numeros.retard).first()).toBeVisible();
    await expect(page.getByText(numeros.bientot)).toHaveCount(0); // pas en retard : filtrée
    expect(refus, `requêtes refusées : ${refus.join(", ")}`).toEqual([]);
    await ctx.close();
  });

  test("« Livraison dans 3 jours » → liste des commandes sur la fenêtre de livraison, filtre visible et retirable", async ({ browser }) => {
    const { storageState } = await ouvrirSession(RECEP);
    const ctx = await browser.newContext({ storageState });
    const page = await ctx.newPage();
    const refus = surveillerRefus(page);

    await page.goto("/tableau-de-bord");
    const lien = toutVoir(page, "Livraison dans 3 jours");
    await expect(lien).toHaveAttribute("href", /^\/commandes\?livraisonDu=\d{4}-\d{2}-\d{2}&livraisonAu=\d{4}-\d{2}-\d{2}$/);
    await lien.click();

    await expect(page).toHaveURL(/\/commandes\?livraisonDu=/);
    await expect(page.getByTestId("filtre-livraison")).toBeVisible();
    await expect(page.getByText(numeros.bientot).first()).toBeVisible();
    await expect(page.getByText(numeros.tard)).toHaveCount(0); // hors fenêtre
    await expect(page.getByText(numeros.retard)).toHaveCount(0); // date passée : hors fenêtre

    // Le filtre se retire : la liste complète revient.
    await page.getByTestId("retirer-filtre-livraison").click();
    await expect(page.getByTestId("filtre-livraison")).toHaveCount(0);
    await expect(page.getByText(numeros.tard).first()).toBeVisible();
    expect(refus, `requêtes refusées : ${refus.join(", ")}`).toEqual([]);
    await ctx.close();
  });

  test("la page Rapports lui reste fermée (frontend : redirection ; backend : 403)", async ({ browser }) => {
    const { storageState } = await ouvrirSession(RECEP);
    const ctx = await browser.newContext({ storageState });
    const page = await ctx.newPage();
    await page.goto("/rapports");
    await expect(page).not.toHaveURL(/\/rapports$/);
    await expect(page).not.toHaveURL(/\/login/);
    await ctx.close();

    const api = await pwRequest.newContext({ baseURL: `http://localhost:${PORT_API}`, storageState });
    try {
      for (const url of ["/api/rapports/commandes/en-retard", "/api/rapports/commandes/a-livrer"]) expect((await api.get(url)).status(), url).toBe(403);
      // La liste des commandes, elle, est ouverte (200), y compris avec les nouveaux filtres de date.
      expect((await api.get(`/api/commandes?enRetard=true`)).status()).toBe(200);
      expect((await api.get(`/api/commandes?livraisonDu=${jour(0)}&livraisonAu=${jour(3)}`)).status()).toBe(200);
    } finally {
      await api.dispose();
    }
  });
});

test.describe("PDG et profils avec rapports.lire : comportement historique vers /rapports", () => {
  test("le PDG : les deux liens pointent vers /rapports et la page s'ouvre", async ({ page }) => {
    const refus = surveillerRefus(page);
    await page.goto("/tableau-de-bord");
    for (const titre of ["Commandes en retard", "Livraison dans 3 jours"]) {
      await expect(toutVoir(page, titre)).toHaveAttribute("href", "/rapports");
    }
    await toutVoir(page, "Commandes en retard").click();
    await expect(page).toHaveURL(/\/rapports$/);
    await expect(page.getByRole("heading", { name: /Rapports/ }).first()).toBeVisible();
    expect(refus, `requêtes refusées : ${refus.join(", ")}`).toEqual([]);
  });

  test.describe("comptable (a rapports.lire)", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("les deux liens pointent vers /rapports", async ({ browser }) => {
      const { status, storageState } = await ouvrirSession(COMPTA);
      expect(status).toBe(200);
      const ctx = await browser.newContext({ storageState });
      const page = await ctx.newPage();
      await page.goto("/tableau-de-bord");
      for (const titre of ["Commandes en retard", "Livraison dans 3 jours"]) {
        await expect(toutVoir(page, titre)).toHaveAttribute("href", "/rapports");
      }
      await ctx.close();
    });
  });
});
