import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";
import { MOT_DE_PASSE, COMPTES } from "../seed.js";
import { ouvrirSession } from "../session.js";

// Quotas commerciaux des formules : suivi de la consommation (page Abonnement), refus de création traduit dans les
// formulaires, libération par l'archivage, atelier sans quota, vues SuperAdmin. L'atelier « Quota » du jeu de données a un
// abonnement actif à limites petites (2 clientes, 1 employé, 2 commandes actives, 2 modèles) et 1 cliente déjà créée.
test.describe.configure({ mode: "serial" });

const MOTIF_LECTURE_SEULE = /lecture seule/i;

/** Contexte navigateur connecté au PDG de l'atelier « Quota ». */
async function sessionQuota(browser) {
  const { status, storageState } = await ouvrirSession(COMPTES.pdgQuota);
  expect(status).toBe(200);
  const ctx = await browser.newContext({ storageState });
  return { ctx, page: await ctx.newPage() };
}

async function remplirCliente(page, { nom, prenom, telephone }) {
  await page.getByLabel(/^Nom \*/).fill(nom);
  await page.getByLabel(/^Prénom \*/).fill(prenom);
  await page.getByLabel(/^Téléphone \*/).fill(telephone);
}

test.describe("atelier avec quotas (PDG « Quota »)", () => {
  test("la page Abonnement montre une jauge par ressource, la formule et la raison", async ({ browser }) => {
    const { ctx, page } = await sessionQuota(browser);
    await page.goto("/abonnement");
    await expect(page.getByTestId("utilisation-formule")).toBeVisible();
    await expect(page.getByTestId("utilisation-raison")).toContainText("Starter E2E");
    await expect(page.getByTestId("jauge-clientes-valeur")).toHaveText("1 sur 2");
    await expect(page.getByTestId("jauge-employes-valeur")).toHaveText("0 sur 1");
    await expect(page.getByTestId("jauge-commandesActives-valeur")).toHaveText("0 sur 2");
    await expect(page.getByTestId("jauge-modeles-valeur")).toHaveText("0 sur 2");
    await expect(page.getByTestId("jauge-clientes")).toHaveAttribute("data-etat", "ok"); // 1 sur 2 : sous le seuil de 80 %
    await expect(page.getByTestId("jauge-employes")).toHaveAttribute("data-etat", "ok");
    await ctx.close();
  });

  test("créer jusqu'à la limite par l'interface ; au-delà : avertissement, refus traduit dans le formulaire, aucune bannière de lecture seule", async ({ browser }) => {
    const { ctx, page } = await sessionQuota(browser);
    await page.goto("/clientes/nouvelle");
    await expect(page.getByTestId("avertissement-quota")).toHaveCount(0); // 1 sur 2 : pas d'avertissement
    await remplirCliente(page, { nom: "Deuxieme", prenom: "Quota", telephone: "90000102" });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).not.toHaveURL(/\/clientes\/nouvelle/);

    // limite atteinte : 2 sur 2
    await page.goto("/clientes/nouvelle");
    await expect(page.getByTestId("avertissement-quota")).toContainText("limite de 2");
    await remplirCliente(page, { nom: "Troisieme", prenom: "Quota", telephone: "90000103" });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText(/limite de 2 est atteinte/).first()).toBeVisible();
    await expect(page).toHaveURL(/\/clientes\/nouvelle/);
    await expect(page.getByText(MOTIF_LECTURE_SEULE)).toHaveCount(0);
    await expect(page.getByText("Une erreur inattendue est survenue")).toHaveCount(0);

    // tout reste consultable
    await page.goto("/clientes");
    await expect(page.getByText("Deuxieme").first()).toBeVisible();
    await page.goto("/abonnement");
    await expect(page.getByTestId("jauge-clientes-valeur")).toHaveText("2 sur 2");
    await expect(page.getByTestId("jauge-clientes")).toHaveAttribute("data-etat", "atteint");
    await expect(page.getByTestId("utilisation-note-limite")).toBeVisible();
    await ctx.close();
  });

  test("archiver une cliente libère une place ; la restaurer alors que la limite est atteinte est refusé", async ({ browser }) => {
    const { ctx, page } = await sessionQuota(browser);
    const liste = await (await ctx.request.get("/api/clientes?q=Deuxieme")).json();
    const deuxieme = liste.data.find((c) => c.nom === "Deuxieme");
    expect((await ctx.request.post(`/api/clientes/${deuxieme.id}/archiver`)).status()).toBe(200);

    await page.goto("/clientes/nouvelle");
    await expect(page.getByTestId("avertissement-quota")).toHaveCount(0);
    await remplirCliente(page, { nom: "Troisieme", prenom: "Quota", telephone: "90000103" });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).not.toHaveURL(/\/clientes\/nouvelle/);

    const restauration = await ctx.request.post(`/api/clientes/${deuxieme.id}/restaurer`);
    expect(restauration.status()).toBe(409);
    expect((await restauration.json()).details.quota).toEqual({ ressource: "clientes", limite: 2, usage: 2 });
    await ctx.close();
  });

  test("employés : limite de 1 ; un deuxième est refusé avec un message traduit", async ({ browser }) => {
    const { ctx, page } = await sessionQuota(browser);
    const premier = await ctx.request.post("/api/employes", { data: { identifiant: "e2e-quota-emp1", password: MOT_DE_PASSE, prenom: "Un", nom: "Employe", poste: "AUTRE" } });
    expect(premier.status(), await premier.text()).toBe(201);

    await page.goto("/employes/nouveau");
    await expect(page.getByTestId("avertissement-quota")).toContainText("limite de 1");
    await page.getByLabel(/^Prénom/).fill("Deux");
    await page.getByLabel(/^Nom \*/).fill("Employe");
    await page.getByLabel(/^Identifiant de connexion/).fill("e2e-quota-emp2");
    await page.getByLabel(/^Mot de passe initial/).fill(MOT_DE_PASSE);
    await page.getByTestId("enregistrer-employe").click();
    await expect(page.getByText(/limite de 1 est atteinte/).first()).toBeVisible();
    await expect(page.getByText(MOTIF_LECTURE_SEULE)).toHaveCount(0);

    // désactiver libère la place
    const liste = await (await ctx.request.get("/api/employes")).json();
    const emp1 = liste.data.find((e) => e.identifiant === "e2e-quota-emp1");
    expect((await ctx.request.post(`/api/employes/${emp1.id}/desactiver`, { data: {} })).status()).toBe(200);
    await page.goto("/employes/nouveau");
    await expect(page.getByTestId("avertissement-quota")).toHaveCount(0);
    await ctx.close();
  });

  test("commandes actives et modèles : refus 409 au quota, le reste fonctionne", async ({ browser }) => {
    const { ctx } = await sessionQuota(browser);
    const clientes = await (await ctx.request.get("/api/clientes?q=Prem")).json();
    const cliente = clientes.data.find((c) => c.prenom === "Prem");
    const corps = { clienteId: cliente.id, typeVetement: "ROBE", prixTotal: "10000", dateLivraisonPrevue: new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10) };
    const creer = (i) => ctx.request.post("/api/commandes", { data: corps, headers: { "Idempotency-Key": `e2e-quota-cmd-${i}-${Date.now()}` } });
    expect((await creer(1)).status()).toBe(201);
    expect((await creer(2)).status()).toBe(201);
    const refus = await creer(3);
    expect(refus.status()).toBe(409);
    expect((await refus.json()).details.quota).toEqual({ ressource: "commandesActives", limite: 2, usage: 2 });

    for (const nom of ["Modele A", "Modele B"]) expect((await ctx.request.post("/api/modeles", { data: { nom, categorie: "ROBE" } })).status()).toBe(201);
    const refusModele = await ctx.request.post("/api/modeles", { data: { nom: "Modele C", categorie: "ROBE" } });
    expect(refusModele.status()).toBe(409);
    expect((await refusModele.json()).details.quota.ressource).toBe("modeles");
    await ctx.close();
  });
});

test.describe("atelier sans quota (essai ou atelier ancien)", () => {
  test.use({ storageState: ETATS.pdg });

  test("la page Abonnement annonce qu'aucune limite ne s'applique et les formulaires n'avertissent pas", async ({ page }) => {
    await page.goto("/abonnement");
    await expect(page.getByTestId("utilisation-raison")).toContainText("Aucune limite ne s'applique");
    await expect(page.getByTestId("jauge-clientes-valeur")).toContainText("illimité");
    await expect(page.getByTestId("jauge-clientes")).toHaveAttribute("data-etat", "illimite");
    await page.goto("/clientes/nouvelle");
    await expect(page.getByTestId("avertissement-quota")).toHaveCount(0);
  });
});

test.describe("SuperAdmin : formules et utilisation", () => {
  test.use({ storageState: ETATS.superadmin });

  test("une formule affiche ses quotas ; on peut en créer une avec des limites ; une formule sans limite est illimitée", async ({ page }) => {
    await page.goto("/tarifs-abonnement");
    await expect(page.getByText("Starter E2E").first()).toBeVisible();
    const carte = page.getByTestId("quotas-formule").first();
    await expect(carte).toBeVisible();

    await page.getByRole("button", { name: "Nouvelle formule" }).click();
    await page.getByLabel(/^Nom/).first().fill("Pro E2E Quotas");
    await page.getByLabel(/^Prix mensuel/).fill("15000");
    await expect(page.getByTestId("champs-quotas")).toBeVisible();
    await page.getByTestId("quota-clientes").fill("500");
    await page.getByTestId("quota-employes").fill("5");
    await page.getByRole("button", { name: "Créer la formule" }).click();
    const nouvelle = page.locator("div", { has: page.getByText("Pro E2E Quotas", { exact: true }) }).filter({ has: page.getByTestId("quotas-formule") }).last();
    await expect(nouvelle.getByTestId("quotas-formule")).toContainText("Clientes : 500");
    await expect(nouvelle.getByTestId("quotas-formule")).toContainText("Employés : 5");
    // Une limite non décidée n'est JAMAIS « illimitée » par défaut : la formule reste non proposée.
    await expect(nouvelle.getByTestId("etat-commercial")).toContainText("Non proposée aux ateliers");
    await expect(nouvelle.getByTestId("quotas-formule")).toContainText("Modèles : Non défini");
  });

  test("valeurs refusées par l'API (zéro, trop grand) : 400, aucune formule créée", async ({ request }) => {
    for (const limites of [{ clientes: 0 }, { modeles: 1_000_001 }]) {
      const res = await request.post("/api/plans-abonnement", { data: { nom: "Invalide E2E", prixMensuel: 1000, limites } });
      expect(res.status()).toBe(400);
    }
  });

  test("la liste « ateliers au-dessus de ces limites » est une aide en lecture seule", async ({ page }) => {
    await page.goto("/tarifs-abonnement");
    const carte = page.locator("div", { has: page.getByText("Starter E2E", { exact: true }) }).filter({ has: page.getByTestId("voir-depassements") }).last();
    await carte.getByTestId("voir-depassements").click();
    await expect(carte.getByTestId("aucun-depassement").or(carte.getByText(/ne sont pas bloqués|n'est bloqué/))).toBeVisible();
  });

  test("la fiche d'un atelier montre sa consommation de quotas", async ({ page }) => {
    await page.goto("/ateliers");
    await page.getByRole("row", { name: /Atelier E2E Quota/ }).getByRole("link", { name: "Gérer" }).click();
    const section = page.getByTestId("utilisation-atelier");
    await expect(section).toBeVisible();
    await expect(section.getByTestId("utilisation-raison")).toContainText("Starter E2E");
    await expect(section.getByTestId("jauge-clientes")).toBeVisible();
    await expect(section.getByTestId("jauge-modeles-valeur")).toContainText("sur 2");
  });
});
