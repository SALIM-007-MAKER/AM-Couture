import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";
import { MOT_DE_PASSE } from "../seed.js";
import { ouvrirSession } from "../session.js";

// Espaces de travail par métier : le PDG crée un employé de chaque poste, puis chacun ouvre sa session et vérifie que
// son accueil montre les bonnes sections, que les écrans qui ne sont pas les siens lui sont fermés (redirection) et
// qu'aucune erreur d'API n'est affichée. Le serveur revérifie chaque droit (couvert aussi par securite.spec.js).
test.use({ storageState: ETATS.pdg });
test.describe.configure({ mode: "serial" });

const POSTES = {
  couturier: { poste: "COUTURIER", id: "e2e-espace-couturier", sections: ["Mes commandes à confectionner"], interdits: ["/paiements", "/depenses", "/employes"] },
  receptionniste: {
    poste: "RECEPTIONNISTE",
    id: "e2e-espace-recep",
    sections: ["Demandes à traiter", "Commandes prêtes à livrer", "Commandes en retard"],
    interdits: ["/stock", "/paiements", "/depenses", "/employes"],
  },
  magasinier: { poste: "MAGASINIER", id: "e2e-espace-magasin", sections: ["Stock sous le seuil", "Marchandises attendues"], interdits: ["/paiements", "/depenses", "/commandes", "/employes"] },
  comptable: { poste: "COMPTABLE", id: "e2e-espace-compta", sections: ["Ce mois-ci", "Derniers paiements", "Dernières dépenses"], interdits: ["/stock", "/employes", "/production"] },
};

test("le PDG crée un employé de chaque poste", async ({ request }) => {
  for (const [nom, p] of Object.entries(POSTES)) {
    const res = await request.post("/api/employes", {
      // Un poste qui a des droits sensibles (finances) exige le mot de passe du PDG.
      data: { identifiant: p.id, password: MOT_DE_PASSE, prenom: "Esp", nom, poste: p.poste, confirmationMotDePasse: MOT_DE_PASSE },
    });
    expect(res.status(), `création ${nom} : ${await res.text()}`).toBe(201);
  }
});

for (const [nom, p] of Object.entries(POSTES)) {
  test.describe(`espace ${nom}`, () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test(`l'accueil ${nom} montre ses sections, sans erreur, et les écrans d'un autre métier sont fermés`, async ({ browser }) => {
      const { status, storageState } = await ouvrirSession(p.id);
      expect(status).toBe(200);
      const ctx = await browser.newContext({ storageState });
      const page = await ctx.newPage();
      const erreursApi = [];
      page.on("response", (r) => {
        if (r.url().includes("/api/") && r.status() >= 400) erreursApi.push(`${r.status()} ${new URL(r.url()).pathname}`);
      });

      await page.goto("/");
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { name: /^Bonjour/ })).toBeVisible();
      for (const titre of p.sections) await expect(page.getByText(titre, { exact: true }).first()).toBeVisible();
      // Aucun message d'erreur affiché sur l'accueil, aucune requête refusée.
      await expect(page.getByText(/Une erreur est survenue|Réservé aux|Accès refusé/i)).toHaveCount(0);
      expect(erreursApi, `requêtes refusées sur l'accueil : ${erreursApi.join(", ")}`).toEqual([]);

      for (const chemin of p.interdits) {
        await page.goto(chemin);
        await expect(page, `${nom} ne doit pas rester sur ${chemin}`).not.toHaveURL(new RegExp(`${chemin}$`));
        await expect(page).not.toHaveURL(/\/login/);
      }
      await ctx.close();
    });
  });
}

test("un poste « autre » n'a qu'un accueil sans section", async ({ request, browser }) => {
  const res = await request.post("/api/employes", { data: { identifiant: "e2e-espace-autre", password: MOT_DE_PASSE, prenom: "Esp", nom: "autre", poste: "AUTRE" } });
  expect(res.status()).toBe(201);
  const { status, storageState } = await ouvrirSession("e2e-espace-autre");
  expect(status).toBe(200);
  const ctx = await browser.newContext({ storageState });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /^Bonjour/ })).toBeVisible();
  await page.goto("/paiements");
  await expect(page).not.toHaveURL(/\/paiements$/);
  await ctx.close();
});
