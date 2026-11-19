import { test } from "node:test";
import assert from "node:assert/strict";
import fr from "../fr.js";
import en from "../en.js";
import { translate } from "../index.js";
import { useLocaleStore } from "../../stores/localeStore.js";
import { CATALOGUE } from "../../../../backend/src/lib/permissions.js";

// Les libellés des permissions (page de gestion d'un employé) sont lus par t(`emp.perm.${permission}`), où `permission`
// vaut par exemple « clientes.lire ». t() résout un CHEMIN POINTÉ (emp → perm → clientes → lire) : une clé écrite à plat
// ("clientes.lire": …) n'est jamais trouvée et l'écran affichait la clé brute « emp.perm.clientes.lire ».
// Le test de parité (parite.test.js) ne le voyait pas : il aplatit les deux dictionnaires de la même façon.

const enLangue = (langue, f) => {
  const avant = useLocaleStore.getState().locale;
  useLocaleStore.setState({ locale: langue });
  try {
    return f();
  } finally {
    useLocaleStore.setState({ locale: avant });
  }
};

for (const [langue, dictionnaire] of [["fr", fr], ["en", en]]) {
  test(`${langue} : chaque permission du catalogue a un vrai libellé, jamais la clé technique emp.perm.*`, () => {
    const permissions = Object.keys(CATALOGUE);
    assert.ok(permissions.length >= 28);
    for (const permission of permissions) {
      const cle = `emp.perm.${permission}`;
      const libelle = enLangue(langue, () => translate(cle));
      assert.notEqual(libelle, cle, `${langue} : « ${cle} » s'afficherait telle quelle`);
      assert.ok(!libelle.startsWith("emp.perm."), `${langue} : ${permission} → ${libelle}`);
      assert.equal(typeof libelle, "string");
      assert.ok(libelle.trim().length > 3, `${langue} : libellé vide pour ${permission}`);
    }
    assert.ok(dictionnaire.emp.perm, "bloc emp.perm présent");
  });
}

test("fr : libellés demandés pour les permissions les plus courantes", () => {
  const t = (p) => enLangue("fr", () => translate(`emp.perm.${p}`));
  assert.equal(t("clientes.lire"), "Consulter les clientes");
  assert.equal(t("clientes.ecrire"), "Créer et modifier les clientes");
  assert.equal(t("commandes.affecter"), "Affecter les commandes à un employé");
  assert.equal(t("commandes.statut"), "Modifier le statut des commandes");
  assert.equal(t("dashboard.lire"), "Consulter le tableau de bord");
});

test("chaque module du catalogue a aussi son titre de groupe (emp.modules.*)", () => {
  const modules = new Set(Object.values(CATALOGUE).map((p) => p.module));
  for (const langue of ["fr", "en"]) {
    for (const m of modules) {
      const cle = `emp.modules.${m}`;
      assert.notEqual(enLangue(langue, () => translate(cle)), cle, `${langue} : titre de groupe manquant pour ${m}`);
    }
  }
});

test("aucune clé de dictionnaire ne contient un point (elle serait introuvable par t(), qui découpe sur les points)", () => {
  const fautives = [];
  const parcourir = (obj, chemin) => {
    for (const [cle, valeur] of Object.entries(obj)) {
      const ici = chemin ? `${chemin}.${cle}` : cle;
      if (cle.includes(".")) fautives.push(ici);
      if (valeur && typeof valeur === "object") parcourir(valeur, ici);
    }
  };
  parcourir(fr, "");
  parcourir(en, "");
  assert.deepEqual(fautives, [], `clés à plat introuvables : ${fautives.slice(0, 10).join(", ")}`);
});
