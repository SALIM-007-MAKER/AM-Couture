import { test, expect, request as pwRequest } from "@playwright/test";
import { ETATS } from "../global-setup.js";
import { MOT_DE_PASSE } from "../seed.js";
import { ouvrirSession } from "../session.js";
import { PORT_API } from "../ports.js";
import { GUIDES } from "../../frontend/src/features/guide/structure.js";
import { sectionsVisibles } from "../../frontend/src/features/guide/guide.js";
import { POSTES, normaliserPermissions } from "../../backend/src/lib/permissions.js";
import fr from "../../frontend/src/i18n/fr.js";
import en from "../../frontend/src/i18n/en.js";
import titresFr from "../../frontend/src/i18n/guides/pdg.fr.js";

// Guide d'utilisation intégré : chaque rôle reçoit SON guide, un employé ne voit que ce que ses droits permettent, et chaque
// étape décrite se déroule sur une vraie page où les libellés cités sont réellement affichés.

const DICO = { fr, en };
const resoudre = (dico, cle) => cle.split(".").reduce((acc, p) => (acc && typeof acc === "object" ? acc[p] : undefined), dico);
const PUBLIQUES = new Set(["/login", "/inscription", "/mot-de-passe-oublie", "/client/activer"]);
const TITRE_PDG = titresFr.title;
// Premier élément VISIBLE qui contient le libellé (un même mot peut aussi figurer dans une option de liste masquée).
const visible = (page, libelle) => page.getByText(libelle).filter({ visible: true }).first();

/** Parcourt chaque étape visible qui a une page : la page s'ouvre (pas de redirection ni d'erreur) et ses libellés sont là. */
async function verifierEtapes(page, guide, user, langue = "fr") {
  const manquants = [];
  for (const section of sectionsVisibles(guide, user)) {
    for (const etape of section.steps) {
      if (!etape.to || PUBLIQUES.has(etape.to)) continue;
      await page.goto(etape.to);
      await page.waitForLoadState("domcontentloaded");
      try {
        await expect(page.getByText("Une erreur inattendue")).toHaveCount(0);
        expect(new URL(page.url()).pathname, `${guide}/${section.id}/${etape.id} : redirigé`).toBe(etape.to);
        for (const cle of etape.ui ?? []) {
          await expect(visible(page, resoudre(DICO[langue], cle)), `${guide}/${section.id}/${etape.id} : « ${cle} »`).toBeVisible();
        }
      } catch (e) {
        manquants.push(`${section.id}/${etape.id} (${etape.to}) : ${String(e.message).split("\n")[0]}`);
      }
    }
  }
  expect(manquants, manquants.join("\n")).toEqual([]);
}

async function contexte(browser, storageState, viewport) {
  const ctx = await browser.newContext({ storageState, ...(viewport ? { viewport } : {}) });
  return { ctx, page: await ctx.newPage() };
}

const idsSections = (page) => page.locator("section[data-section]").evaluateAll((els) => els.map((e) => e.dataset.section));

// ------------------------------------------------------------------ PDG

test.describe("PDG", () => {
  test.use({ storageState: ETATS.pdg });
  const PDG = { role: "ADMIN" };

  test("le menu propose « Guide d'utilisation » et ouvre le guide du PDG, seulement le sien", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: "Guide d'utilisation" }).first().click();
    await expect(page).toHaveURL(/\/aide$/);
    await expect(page.getByRole("heading", { name: TITRE_PDG })).toBeVisible();
    expect(await idsSections(page)).toEqual(GUIDES.pdg.map((s) => s.id));
    // Aucun contenu des autres guides.
    await expect(page.getByText("Guide de l'employé")).toHaveCount(0);
    await expect(page.getByText("Guide de la cliente et du client")).toHaveCount(0);
    await expect(page.getByText("Guide de l'administrateur de la plateforme")).toHaveCount(0);
  });

  test("les étapes numérotées citent des libellés qui existent vraiment à l'écran", async ({ page }) => {
    test.setTimeout(240_000);
    await verifierEtapes(page, "pdg", PDG);
  });

  test("les libellés cités sont affichés en gras entre guillemets, et le résultat attendu est présent", async ({ page }) => {
    await page.goto("/aide");
    const etape = page.locator('section[data-section="paiements"] li[data-etape="encaisser"]');
    await expect(etape).toContainText("Ajouter le paiement");
    await expect(etape.locator("strong").first()).toBeVisible();
    await expect(etape).toContainText("Résultat attendu");
  });

  test("le PDG n'accède pas aux guides des autres rôles", async ({ page }) => {
    for (const chemin of ["/client/aide", "/aide-plateforme"]) {
      await page.goto(chemin);
      await expect(page).not.toHaveURL(new RegExp(`${chemin}$`));
      await expect(page.getByRole("heading", { name: TITRE_PDG })).toHaveCount(0);
    }
  });

  test("anglais : le guide, ses libellés et ses captures suivent la langue du compte", async ({ page, request }) => {
    try {
      await request.patch("/api/compte", { data: { langue: "en" } });
      await page.goto("/aide");
      await expect(page.getByRole("heading", { name: "Owner's guide" })).toBeVisible();
      await expect(page.locator('section[data-section="commandes"]')).toContainText("New order");
      await expect(page.getByRole("link", { name: "Open this screen" }).first()).toBeVisible();
    } finally {
      await request.patch("/api/compte", { data: { langue: "fr" } });
    }
  });

  test("mobile 390 px : aucun débordement, sommaire déroulant, étapes lisibles", async ({ browser }) => {
    const { ctx, page } = await contexte(browser, ETATS.pdg, { width: 390, height: 800 });
    await page.goto("/aide");
    await expect(page.getByRole("heading", { name: TITRE_PDG })).toBeVisible();
    await expect(page.getByText("Sommaire").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    // Le sommaire déroulant mène à une section.
    await page.getByText("Sommaire").first().click();
    await page.locator("details a", { hasText: "Votre abonnement" }).click();
    await expect(page.locator("#guide-abonnement")).toBeInViewport();
    // Le menu mobile (tiroir « Plus ») donne accès au guide.
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    await expect(page.getByRole("link", { name: "Guide d'utilisation" }).last()).toBeVisible();
    await ctx.close();
  });

  test("ordinateur : sommaire latéral visible, sommaire déroulant masqué", async ({ browser }) => {
    const { ctx, page } = await contexte(browser, ETATS.pdg, { width: 1280, height: 800 });
    await page.goto("/aide");
    await expect(page.locator('nav[aria-label="Sommaire"]')).toBeVisible();
    await expect(page.locator("details")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await ctx.close();
  });
});

// ------------------------------------------------------------------ Employés (un par poste)

const EMPLOYES = {
  COUTURIER: "e2e-guide-couturier",
  RECEPTIONNISTE: "e2e-guide-reception",
  MAGASINIER: "e2e-guide-magasinier",
  COMPTABLE: "e2e-guide-comptable",
  AUTRE: "e2e-guide-autre",
};
const unEmploye = (poste) => ({ role: "EMPLOYE", poste, permissions: normaliserPermissions(POSTES[poste]) });

test.describe("employés : le guide suit le poste et les permissions", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    const api = await pwRequest.newContext({ baseURL: `http://localhost:${PORT_API}`, storageState: ETATS.pdg });
    for (const [poste, identifiant] of Object.entries(EMPLOYES)) {
      const res = await api.post("/api/employes", {
        data: { identifiant, password: MOT_DE_PASSE, prenom: "Guide", nom: poste, poste, confirmationMotDePasse: MOT_DE_PASSE },
        headers: { "Idempotency-Key": `guide-${identifiant}`, "X-Forwarded-For": "10.88.0.1" },
      });
      if (![201, 409].includes(res.status())) throw new Error(`création ${identifiant} : ${res.status()} ${await res.text()}`);
    }
    await api.dispose();
  });

  for (const [poste, identifiant] of Object.entries(EMPLOYES)) {
    test(`${poste} : sections attendues, aucune section interdite, étapes réelles`, async ({ browser }) => {
      test.setTimeout(180_000);
      const { status, storageState } = await ouvrirSession(identifiant);
      expect(status).toBe(200);
      const { ctx, page } = await contexte(browser, storageState);
      const user = unEmploye(poste);
      await page.goto("/aide");
      await expect(page.getByRole("heading", { name: "Guide de l'employé" })).toBeVisible();
      const attendues = sectionsVisibles("employe", user).map((s) => s.id);
      expect(await idsSections(page)).toEqual(attendues);
      // Aucune section du guide du PDG ni d'un autre poste non autorisé.
      await expect(page.getByText(TITRE_PDG)).toHaveCount(0);
      await verifierEtapes(page, "employe", user);
      await ctx.close();
    });
  }

  test("le couturier ne lit rien sur les paiements, le stock ou les demandes", async ({ browser }) => {
    const { storageState } = await ouvrirSession(EMPLOYES.COUTURIER);
    const { ctx, page } = await contexte(browser, storageState);
    await page.goto("/aide");
    const texte = await page.locator("main").innerText();
    for (const interdit of ["Ajouter le paiement", "Nouvel article", "Accepter et lier", "Enregistrer la livraison", "Nouvel employé"]) {
      expect(texte, `« ${interdit} » ne doit pas apparaître`).not.toContain(interdit);
    }
    await ctx.close();
  });

  test("mobile : le guide de l'employé ne déborde pas", async ({ browser }) => {
    const { storageState } = await ouvrirSession(EMPLOYES.COMPTABLE);
    const { ctx, page } = await contexte(browser, storageState, { width: 390, height: 800 });
    await page.goto("/aide");
    await expect(page.getByRole("heading", { name: "Guide de l'employé" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await ctx.close();
  });
});

// ------------------------------------------------------------------ Client

test.describe("client", () => {
  test.use({ storageState: ETATS.client });

  test("l'espace client propose son guide, et seulement le sien", async ({ page }) => {
    const requetes = [];
    page.on("request", (r) => requetes.push(r.url()));
    await page.goto("/client");
    await page.getByRole("link", { name: "Guide d'utilisation" }).first().click();
    await expect(page).toHaveURL(/\/client\/aide$/);
    await expect(page.getByRole("heading", { name: "Guide de la cliente et du client" })).toBeVisible();
    expect(await idsSections(page)).toEqual(GUIDES.client.map((s) => s.id));
    // Le contenu des autres guides n'est même pas téléchargé.
    for (const autre of ["pdg", "employe", "superadmin"]) expect(requetes.filter((u) => u.includes(`/guides/${autre}.`)), autre).toEqual([]);
  });

  test("les étapes décrites correspondent aux écrans réels du client", async ({ page }) => {
    test.setTimeout(120_000);
    await verifierEtapes(page, "client", { role: "USER" });
  });

  test("« Mes données » : exporter et supprimer existent bien, comme le guide le décrit", async ({ page }) => {
    await page.goto("/client");
    await expect(page.getByRole("link", { name: "Télécharger mes données" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Supprimer mon compte" })).toBeVisible();
  });

  test.describe("langue de l'espace client (décrite par le guide)", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("l'anglais choisi à la connexion ne dure que jusqu'au rechargement : la langue du compte (français) s'applique", async ({ page }) => {
      await page.goto("/login");
      await page.getByRole("button", { name: "EN", exact: true }).click();
      await page.locator("#identifiant").fill("e2e-client-alpha");
      await page.locator("#password").fill(MOT_DE_PASSE);
      await page.locator("form button[type=submit]").click();
      await page.waitForURL(/\/client/);
      const menu = page.getByRole("navigation").first();
      await expect(menu).toContainText("Orders");
      // Aucun sélecteur de langue dans l'espace client.
      await expect(page.getByRole("button", { name: /^(FR|EN)$/ })).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("navigation").first()).toContainText("Commandes");
    });
  });

  test("le client n'accède pas aux guides de l'atelier ni de la plateforme", async ({ page }) => {
    for (const chemin of ["/aide", "/aide-plateforme"]) {
      await page.goto(chemin);
      await expect(page).not.toHaveURL(new RegExp(`${chemin}$`));
    }
  });

  test("mobile 390 px : le guide est accessible depuis le menu et ne déborde pas", async ({ browser }) => {
    const { ctx, page } = await contexte(browser, ETATS.client, { width: 390, height: 800 });
    await page.goto("/client");
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    await page.getByRole("link", { name: "Guide d'utilisation" }).last().click();
    await expect(page.getByRole("heading", { name: "Guide de la cliente et du client" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await ctx.close();
  });
});

// ------------------------------------------------------------------ SUPERADMIN

test.describe("SUPERADMIN", () => {
  test.use({ storageState: ETATS.superadmin });

  test("le bouton du guide de l'en-tête ouvre le guide d'administration, seulement le sien", async ({ page }) => {
    await page.goto("/vue-ensemble");
    await page.getByRole("link", { name: "Guide d'utilisation" }).click();
    await expect(page).toHaveURL(/\/aide-plateforme$/);
    await expect(page.getByRole("heading", { name: "Guide de l'administrateur de la plateforme" })).toBeVisible();
    expect(await idsSections(page)).toEqual(GUIDES.superadmin.map((s) => s.id));
    await expect(page.getByText(TITRE_PDG)).toHaveCount(0);
  });

  test("les étapes décrites correspondent aux écrans réels de la plateforme", async ({ page }) => {
    test.setTimeout(120_000);
    await verifierEtapes(page, "superadmin", { role: "SUPERADMIN" });
  });

  test("la langue se règle dans « Mon compte » : le guide le dit et l'écran le permet", async ({ page }) => {
    await page.goto("/vue-ensemble");
    await expect(page.getByRole("button", { name: /^(FR|EN)$/ })).toHaveCount(0);
    await page.goto("/mon-compte");
    await expect(page.getByText("Langue").first()).toBeVisible();
  });

  test("le SUPERADMIN n'accède pas aux guides de l'atelier ni du client", async ({ page }) => {
    for (const chemin of ["/aide", "/client/aide"]) {
      await page.goto(chemin);
      await expect(page).not.toHaveURL(new RegExp(`${chemin}$`));
    }
  });

  test("mobile 390 px : le bouton du guide reste atteignable, aucun débordement", async ({ browser }) => {
    const { ctx, page } = await contexte(browser, ETATS.superadmin, { width: 390, height: 800 });
    await page.goto("/vue-ensemble");
    await page.getByRole("link", { name: "Guide d'utilisation" }).click();
    await expect(page.getByRole("heading", { name: "Guide de l'administrateur de la plateforme" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await ctx.close();
  });
});

// ------------------------------------------------------------------ Pages publiques citées par les guides

test.describe("pages publiques décrites par les guides", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const [guide, etapes] of [["pdg", GUIDES.pdg], ["client", GUIDES.client], ["superadmin", GUIDES.superadmin]]) {
    test(`${guide} : les pages de connexion et d'inscription affichent les libellés cités`, async ({ page }) => {
      for (const section of etapes) {
        for (const etape of section.steps) {
          if (!etape.to || !PUBLIQUES.has(etape.to) || !etape.ui?.length) continue;
          await page.goto(etape.to);
          for (const cle of etape.ui) {
            await expect(visible(page, resoudre(fr, cle)), `${guide}/${section.id}/${etape.id} : « ${cle} »`).toBeVisible();
          }
        }
      }
    });
  }

  test("la page du lien d'invitation existe (jeton absent : message d'aide)", async ({ page }) => {
    await page.goto("/client/activer");
    await expect(page.getByText(resoudre(fr, "activation.invalidLink"))).toBeVisible();
  });
});

// ------------------------------------------------------------------ Parcours réel : on suit les étapes du guide du PDG

test.describe("parcours décrit par le guide du PDG, exécuté pour de vrai", () => {
  test.use({ storageState: ETATS.pdg });
  test.describe.configure({ mode: "serial" });
  const L = (cle) => resoudre(fr, cle);
  let fiche;

  test("clients : « Nouveau client » → formulaire → fiche, puis « Nouvelle mesure »", async ({ page }) => {
    await page.goto("/clientes");
    await page.getByRole("link", { name: L("clientes.newCliente") }).first().click();
    await expect(page).toHaveURL(/\/clientes\/nouvelle$/);
    await page.getByLabel(/^Nom \*/).fill("Guide");
    await page.getByLabel(/^Prénom \*/).fill("Parcours");
    await page.getByLabel(/^Téléphone \*/).fill("93000001");
    await page.getByRole("button", { name: L("common.save") }).click();
    await expect(page).toHaveURL(/\/clientes\/(?!nouvelle)[a-z0-9]+$/);
    fiche = page.url();
    await page.getByRole("link", { name: L("cli.detail.newMeasure") }).first().click();
    await expect(page.getByRole("heading", { name: L("mesure.form.title") })).toBeVisible();
    await page.getByLabel(new RegExp(`^${L("cli.mesure.poitrine")}`)).fill("92");
    await page.getByRole("button", { name: L("common.save") }).click();
    await expect(page).toHaveURL(fiche);
  });

  test("commandes : création avec acompte → fiche avec prix, encaissé et reste à payer", async ({ page }) => {
    await page.goto("/commandes");
    await page.getByRole("link", { name: L("commandes.newCommande") }).first().click();
    await page.getByLabel(/^Client \*/).selectOption({ label: "Guide Parcours — 93000001" });
    await page.getByLabel(/^Type de vêtement \*/).selectOption({ label: L("modele.categorie.ROBE") });
    await page.getByLabel(/^Prix total \*/).fill("30000");
    await page.getByLabel(/^Priorité/).selectOption({ label: L("cmdConst.priorite.URGENTE") });
    const date = new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel(/^Date de livraison prévue \*/).fill(date);
    await page.getByLabel(L("cmd.formPaiementInitial")).check();
    await page.getByLabel(/^Montant/).last().fill("10000");
    await page.getByRole("button", { name: L("cmd.formEnregistrer") }).click();
    await expect(page).toHaveURL(/\/commandes\/(?!nouvelle)[a-z0-9]+$/);
    await expect(page.getByText(L("cmdConst.statut.NOUVELLE")).first()).toBeVisible();
    await expect(page.getByText("20000").first()).toBeVisible();
  });

  test("statuts : « Passer à … » fait avancer, la livraison n'est possible qu'à « Terminée »", async ({ page }) => {
    await page.goto("/commandes");
    await page.getByRole("row", { name: /Guide Parcours/ }).getByRole("link", { name: "Voir" }).click();
    await expect(page.getByText(L("cmd.livrPossibleQuand"))).toBeVisible();
    await expect(page.getByRole("button", { name: L("cmd.livrEnregistrer") })).toHaveCount(0);
    for (const statut of ["EN_CONFECTION", "ESSAYAGE", "RETOUCHES", "TERMINEE"]) {
      await page.getByRole("button", { name: new RegExp(`Passer à .*${L(`cmdConst.statut.${statut}`)}`) }).click();
      await expect(page.getByText(L(`cmdConst.statut.${statut}`)).first()).toBeVisible();
    }
    await expect(page.getByText(L("cmd.livrPossibleQuand"))).toHaveCount(0);
  });

  test("paiement, reçu puis livraison : le solde se règle, le reçu est émis, la commande est livrée", async ({ page }) => {
    await page.goto("/commandes");
    await page.getByRole("row", { name: /Guide Parcours/ }).getByRole("link", { name: "Voir" }).click();
    await page.getByLabel(/^Montant \*/).first().fill("20000");
    await page.getByRole("button", { name: L("cmd.paieAjouter") }).click();
    await expect(page.getByRole("button", { name: L("recu.emettre") }).first()).toBeVisible();
    await page.getByRole("button", { name: L("recu.emettre") }).first().click();
    await expect(page.getByText(/REC-|Reçu/).first()).toBeVisible();
    await page.getByRole("button", { name: L("cmd.livrEnregistrer") }).click();
    await expect(page.getByText(/Livrée le/).first()).toBeVisible();
    // Retrouvé dans les écrans d'historique cités par le guide.
    await page.goto("/livraisons");
    await expect(page.getByText("Guide").first()).toBeVisible();
    await page.goto("/recus");
    await expect(page.getByText("Guide").first()).toBeVisible();
    await page.goto("/paiements");
    await expect(page.getByText("Guide").first()).toBeVisible();
  });
});
