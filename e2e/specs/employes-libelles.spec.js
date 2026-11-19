import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Page de gestion des permissions d'un employé : chaque case porte un libellé lisible, jamais une clé technique « emp.perm.* ».
// (Les identifiants des cases, data-testid="perm-<permission>", et les droits eux-mêmes ne sont pas concernés.)
test.use({ storageState: ETATS.pdg });

const CLE_TECHNIQUE = /emp\.(perm|modules)\./;

const attendus = {
  "clientes.lire": "Consulter les clientes",
  "clientes.ecrire": "Créer et modifier les clientes",
  "commandes.statut": "Modifier le statut des commandes",
  "commandes.affecter": "Affecter les commandes à un employé",
  "dashboard.lire": "Consulter le tableau de bord",
};

/** { permission: texte du libellé } pour toutes les cases de la grille. */
async function libelles(page) {
  const cases = page.locator('[data-testid^="perm-"]');
  const n = await cases.count();
  const sortie = {};
  for (let i = 0; i < n; i++) {
    const c = cases.nth(i);
    const id = (await c.getAttribute("data-testid")).replace(/^perm-/, "");
    sortie[id] = (await c.locator("xpath=ancestor::label[1]").innerText()).replace(/\s+/g, " ").trim();
  }
  return sortie;
}

test("français : toutes les permissions ont un libellé lisible, aucune clé technique", async ({ page }) => {
  await page.goto("/employes/nouveau");
  await expect(page.getByTestId("grille-permissions")).toBeVisible();
  const l = await libelles(page);
  expect(Object.keys(l).length).toBeGreaterThanOrEqual(28);
  for (const [permission, texte] of Object.entries(l)) {
    expect(texte, `libellé de ${permission}`).not.toMatch(CLE_TECHNIQUE);
    expect(texte.length, `libellé vide pour ${permission}`).toBeGreaterThan(3);
  }
  for (const [permission, texte] of Object.entries(attendus)) expect(l[permission]).toContain(texte);
  await expect(page.getByText(CLE_TECHNIQUE)).toHaveCount(0);
  // Les titres de groupes aussi.
  await expect(page.getByRole("group", { name: "Clientes et mesures" })).toBeVisible();
});

test("anglais (langue du compte) : mêmes garanties", async ({ page, request }) => {
  // Pour un compte connecté, la langue affichée est celle du compte (LocaleSync) : le bouton FR/EN de l'en-tête est aussitôt
  // réaligné dessus. On change donc la langue du compte, puis on la remet en français (les autres tests la supposent telle).
  expect((await request.patch("/api/compte", { data: { langue: "en" } })).ok()).toBe(true);
  try {
    await page.goto("/employes/nouveau");
    await expect(page.getByTestId("grille-permissions")).toBeVisible();
    await expect(page.getByRole("group", { name: "Clients and measurements" })).toBeVisible();
    const l = await libelles(page);
    expect(Object.keys(l).length).toBeGreaterThanOrEqual(28);
    for (const [permission, texte] of Object.entries(l)) expect(texte, `libellé de ${permission}`).not.toMatch(CLE_TECHNIQUE);
    expect(l["clientes.lire"]).toContain("View clients");
    expect(l["commandes.affecter"]).toContain("Assign orders to an employee");
    expect(l["dashboard.lire"]).toContain("View the dashboard");
    await expect(page.getByText(CLE_TECHNIQUE)).toHaveCount(0);
  } finally {
    expect((await request.patch("/api/compte", { data: { langue: "fr" } })).ok()).toBe(true);
  }
});

test("les droits par défaut d'un poste sont inchangés (cases cochées pour une réceptionniste)", async ({ page }) => {
  await page.goto("/employes/nouveau");
  await page.getByTestId("select-poste").selectOption("RECEPTIONNISTE");
  for (const p of ["clientes.lire", "clientes.ecrire", "commandes.lire", "commandes.ecrire", "dashboard.lire"]) await expect(page.getByTestId(`perm-${p}`)).toBeChecked();
  for (const p of ["finances.voir", "rapports.lire", "commandes.affecter", "stock.lire"]) await expect(page.getByTestId(`perm-${p}`)).not.toBeChecked();
});
