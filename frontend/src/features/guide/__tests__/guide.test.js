import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDES, NOMS_GUIDES, ROLES_GUIDE, toutesLesCaptures } from "../structure.js";
import { guideDe, sectionsVisibles, decouper, clesCitees, texteBrut, lienEtape } from "../guide.js";
import { peutAcceder, PERMISSION_PAR_CHEMIN } from "../../employes/permissions.js";
import { CATALOGUE, POSTES, normaliserPermissions } from "../../../../../backend/src/lib/permissions.js";
import fr from "../../../i18n/fr.js";
import en from "../../../i18n/en.js";

const TEXTES = {};
for (const guide of NOMS_GUIDES) {
  TEXTES[guide] = {
    fr: (await import(`../../../i18n/guides/${guide}.fr.js`)).default,
    en: (await import(`../../../i18n/guides/${guide}.en.js`)).default,
  };
}
const DICO = { fr, en };
const resoudre = (dico, cle) => cle.split(".").reduce((acc, p) => (acc && typeof acc === "object" ? acc[p] : undefined), dico);
const etapes = (guide) => GUIDES[guide].flatMap((s) => s.steps.map((e) => ({ section: s, ...e })));

// ---------- Cohérence structure <-> textes (français et anglais) ----------

test("chaque rôle a son guide et chaque guide a des sections", () => {
  assert.deepEqual(Object.values(ROLES_GUIDE).sort(), [...NOMS_GUIDES].sort());
  for (const guide of NOMS_GUIDES) assert.ok(GUIDES[guide].length >= 5, `${guide} : trop peu de sections`);
});

test("identifiants de sections et d'étapes uniques", () => {
  for (const guide of NOMS_GUIDES) {
    const sections = GUIDES[guide].map((s) => s.id);
    assert.equal(new Set(sections).size, sections.length, `${guide} : sections en double`);
    for (const s of GUIDES[guide]) {
      const ids = s.steps.map((e) => e.id);
      assert.equal(new Set(ids).size, ids.length, `${guide}/${s.id} : étapes en double`);
    }
  }
});

for (const langue of ["fr", "en"]) {
  test(`${langue} : chaque section et chaque étape de la structure a son texte, et inversement`, () => {
    for (const guide of NOMS_GUIDES) {
      const texte = TEXTES[guide][langue];
      assert.ok(texte.title && texte.subtitle && texte.intro, `${guide}/${langue} : titre, sous-titre ou introduction manquant`);
      assert.deepEqual(Object.keys(texte.sections).sort(), GUIDES[guide].map((s) => s.id).sort(), `${guide}/${langue} : sections`);
      for (const s of GUIDES[guide]) {
        const t = texte.sections[s.id];
        assert.ok(t.title, `${guide}/${s.id}/${langue} : titre manquant`);
        assert.deepEqual(Object.keys(t.steps).sort(), s.steps.map((e) => e.id).sort(), `${guide}/${s.id}/${langue} : étapes`);
        for (const e of s.steps) {
          assert.ok(t.steps[e.id].text?.length > 20, `${guide}/${s.id}/${e.id}/${langue} : texte manquant`);
          assert.ok(t.steps[e.id].result?.length > 5, `${guide}/${s.id}/${e.id}/${langue} : résultat attendu manquant`);
        }
      }
    }
  });

  test(`${langue} : chaque libellé d'interface cité [[cle]] existe réellement dans le dictionnaire`, () => {
    const manquants = [];
    for (const guide of NOMS_GUIDES) {
      const texte = TEXTES[guide][langue];
      for (const s of GUIDES[guide]) {
        for (const e of s.steps) {
          const { text, result } = texte.sections[s.id].steps[e.id];
          for (const cle of [...clesCitees(text), ...clesCitees(result)]) {
            const valeur = resoudre(DICO[langue], cle);
            if (typeof valeur !== "string" || valeur.includes("{{")) manquants.push(`${guide}/${s.id}/${e.id}: ${cle}`);
          }
        }
      }
    }
    assert.deepEqual(manquants, [], `libellés inexistants ou variables : ${manquants.slice(0, 15).join(" | ")}`);
  });
}

test("FR et EN citent exactement les mêmes libellés d'interface pour chaque étape", () => {
  const ecarts = [];
  for (const guide of NOMS_GUIDES) {
    for (const s of GUIDES[guide]) {
      for (const e of s.steps) {
        for (const champ of ["text", "result"]) {
          const a = clesCitees(TEXTES[guide].fr.sections[s.id].steps[e.id][champ]).sort().join();
          const b = clesCitees(TEXTES[guide].en.sections[s.id].steps[e.id][champ]).sort().join();
          if (a !== b) ecarts.push(`${guide}/${s.id}/${e.id}/${champ}`);
        }
      }
    }
  }
  assert.deepEqual(ecarts, [], `libellés différents entre FR et EN : ${ecarts.join(", ")}`);
});

test("aucun libellé d'écran n'est écrit en dur entre guillemets sans passer par une clé (garde contre les boutons inventés)", () => {
  // Les libellés connus du dictionnaire ne doivent pas apparaître recopiés à la main : ils doivent être des [[cle]].
  const suspects = [];
  const libelles = ["Nouvelle commande", "Nouveau client", "Enregistrer la livraison", "Ajouter le paiement", "Inviter ce client", "Déclarer mon paiement"];
  for (const guide of NOMS_GUIDES) {
    for (const [s, e] of etapes(guide).map((x) => [x.section, x])) {
      const { text } = TEXTES[guide].fr.sections[s.id].steps[e.id];
      const sansCles = decouper(text).filter((m) => m.texte).map((m) => m.texte).join(" ");
      for (const l of libelles) if (sansCles.includes(l)) suspects.push(`${guide}/${s.id}/${e.id}: ${l}`);
    }
  }
  assert.deepEqual(suspects, []);
});

// ---------- Navigation : pages et captures ----------

const app = readFileSync(new URL("../../../App.jsx", import.meta.url), "utf8");
const routes = [...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
const versRegex = (chemin) => new RegExp(`^${chemin.replace(/:[^/]+/g, "[^/]+").replace(/\{[^}]+\}/g, "[^/]+")}$`);

test("chaque page citée par une étape ou une capture est une vraie route de l'application", () => {
  const inconnues = [];
  const pages = [...etapes("pdg"), ...etapes("employe"), ...etapes("client"), ...etapes("superadmin")].map((e) => e.to).filter(Boolean);
  for (const c of toutesLesCaptures()) pages.push(c.to);
  for (const to of new Set(pages)) if (!routes.some((r) => versRegex(to).test(r) || versRegex(r).test(to))) inconnues.push(to);
  assert.deepEqual(inconnues, [], `routes absentes de App.jsx : ${inconnues.join(", ")}`);
});

test("chaque libellé attendu à l'écran (ui) et chaque cible de capture existe dans le dictionnaire FR et EN", () => {
  const manquants = [];
  for (const guide of NOMS_GUIDES) {
    for (const e of etapes(guide)) {
      for (const cle of [...(e.ui ?? []), ...(e.cible ? [e.cible] : [])]) {
        for (const langue of ["fr", "en"]) {
          const v = resoudre(DICO[langue], cle);
          if (typeof v !== "string" || v.includes("{{")) manquants.push(`${guide}/${e.id}/${langue}: ${cle}`);
        }
      }
    }
  }
  assert.deepEqual(manquants, []);
});

test("captures : identifiants uniques, annotations non précédées d'une étape conditionnelle", () => {
  const ids = toutesLesCaptures().map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const guide of NOMS_GUIDES) {
    for (const s of GUIDES[guide].filter((x) => x.shot)) {
      const derniere = s.steps.map((e, i) => (e.cible ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      assert.ok(derniere >= 0, `${guide}/${s.id} : une capture sans étape annotée`);
      const gatee = s.steps.slice(0, derniere + 1).some((e) => e.permissions?.length);
      assert.ok(!gatee, `${guide}/${s.id} : une étape conditionnelle précède une étape annotée (numéros de capture faux)`);
    }
  }
});

// ---------- Permissions : jamais d'écran ou d'action interdit ----------

test("toute permission citée existe dans le catalogue du serveur", () => {
  const inconnues = [];
  for (const guide of NOMS_GUIDES) {
    for (const s of GUIDES[guide]) {
      for (const p of s.permissions ?? []) if (!CATALOGUE[p]) inconnues.push(`${guide}/${s.id}: ${p}`);
      for (const e of s.steps) for (const p of e.permissions ?? []) if (!CATALOGUE[p]) inconnues.push(`${guide}/${s.id}/${e.id}: ${p}`);
    }
  }
  assert.deepEqual(inconnues, []);
});

test("guide de l'employé : l'écran d'une étape est accessible avec les seules permissions de sa section et de l'étape", () => {
  const trop = [];
  for (const s of GUIDES.employe) {
    for (const e of s.steps) {
      if (!e.to) continue;
      const permissions = normaliserPermissions([...(s.permissions ?? []), ...(e.permissions ?? [])]);
      const employe = { role: "EMPLOYE", permissions };
      const racine = `/${e.to.split("/")[1] ?? ""}`;
      if (!(racine in PERMISSION_PAR_CHEMIN)) trop.push(`${s.id}/${e.id}: ${e.to} inconnu`);
      else if (!peutAcceder(employe, racine)) trop.push(`${s.id}/${e.id}: ${e.to} exige ${PERMISSION_PAR_CHEMIN[racine]}`);
    }
  }
  assert.deepEqual(trop, [], `étapes qui mènent à un écran non autorisé par leurs permissions : ${trop.join(" | ")}`);
});

const employe = (permissions, poste) => ({ role: "EMPLOYE", poste, permissions: normaliserPermissions(permissions) });
const idsVisibles = (user) => sectionsVisibles("employe", user).map((s) => s.id);

test("couturier : ne voit ni paiements, ni stock, ni demandes", () => {
  const ids = idsVisibles(employe(POSTES.COUTURIER, "COUTURIER"));
  assert.deepEqual(ids, ["bienvenue", "couturier"]);
});

test("réceptionniste : clientes, commandes, demandes, livraisons ; rien sur le stock ni l'argent", () => {
  const ids = idsVisibles(employe(POSTES.RECEPTIONNISTE, "RECEPTIONNISTE"));
  assert.deepEqual(ids, ["bienvenue", "reception", "demandes", "livraisons"]);
});

test("magasinier : stock, fournisseurs, réception d'achats ; pas de paiement", () => {
  const sections = sectionsVisibles("employe", employe(POSTES.MAGASINIER, "MAGASINIER"));
  assert.deepEqual(sections.map((s) => s.id), ["bienvenue", "magasinier"]);
  const m = sections.find((s) => s.id === "magasinier");
  assert.deepEqual(m.steps.map((e) => e.id), ["alertes", "article", "mouvement", "fournisseurs", "recevoir"]);
});

test("comptable : paiements, dépenses, rapports ; pas de création de commande ni de stock", () => {
  const ids = idsVisibles(employe(POSTES.COMPTABLE, "COMPTABLE"));
  assert.deepEqual(ids, ["bienvenue", "comptable"]);
});

test("poste AUTRE sans droits : bienvenue (notifications) et section générale seulement", () => {
  const sections = sectionsVisibles("employe", employe(POSTES.AUTRE, "AUTRE"));
  assert.deepEqual(sections.map((s) => s.id), ["bienvenue", "autre"]);
  assert.deepEqual(sections[0].steps.map((e) => e.id), ["accueil", "droits", "cloche", "compte", "lectureSeule"]);
});

test("un employé sans notifications.lire ne voit pas l'étape de la cloche", () => {
  const sections = sectionsVisibles("employe", employe(["commandes.lire"], "COUTURIER"));
  assert.ok(!sections[0].steps.some((e) => e.id === "cloche"));
});

test("un couturier sans droit de statut ne voit pas l'étape « statut » ; les permissions personnalisées priment sur le poste", () => {
  // Sans « commandes.statut », la section du couturier disparaît entièrement : rien ne lui explique une action qu'il n'a pas.
  assert.ok(!idsVisibles(employe(["commandes.lire"], "COUTURIER")).includes("couturier"));
  // Avec le droit, mais sans « clientes.lire », l'étape des mesures est absente.
  // Un comptable à qui le PDG retire finances.voir perd la section « comptable ».
  const perms = POSTES.COMPTABLE.filter((p) => p !== "finances.voir" && p !== "paiements.lire" && p !== "paiements.ecrire");
  assert.ok(!idsVisibles({ role: "EMPLOYE", poste: "COMPTABLE", permissions: perms }).includes("comptable"));
  // Un couturier à qui le PDG ajoute la livraison la voit, même si son poste ne la prévoit pas.
  assert.ok(idsVisibles(employe([...POSTES.COUTURIER, "livraisons.ecrire"], "COUTURIER")).includes("livraisons"));
});

test("la section du poste passe avant les autres", () => {
  const ids = idsVisibles(employe([...POSTES.COUTURIER, ...POSTES.MAGASINIER], "MAGASINIER"));
  assert.equal(ids[1], "magasinier");
  assert.ok(ids.indexOf("couturier") > ids.indexOf("magasinier"));
});

test("les numéros d'étape suivent les étapes réellement visibles", () => {
  for (const s of sectionsVisibles("employe", employe(POSTES.MAGASINIER, "MAGASINIER"))) {
    assert.deepEqual(s.steps.map((e) => e.numero), s.steps.map((_, i) => i + 1));
  }
});

test("chaque rôle n'obtient que son guide", () => {
  assert.equal(guideDe({ role: "ADMIN" }), "pdg");
  assert.equal(guideDe({ role: "EMPLOYE" }), "employe");
  assert.equal(guideDe({ role: "USER" }), "client");
  assert.equal(guideDe({ role: "SUPERADMIN" }), "superadmin");
  assert.equal(guideDe(null), null);
  assert.equal(guideDe({ role: "AUTRE" }), null);
});

test("le PDG, le client et le SUPERADMIN voient toutes les sections de leur guide", () => {
  for (const [guide, user] of [["pdg", { role: "ADMIN" }], ["client", { role: "USER" }], ["superadmin", { role: "SUPERADMIN" }]]) {
    assert.deepEqual(sectionsVisibles(guide, user).map((s) => s.id), GUIDES[guide].map((s) => s.id));
  }
});

test("le guide du PDG ne cite que des écrans de l'atelier, celui du client que des écrans /client, celui du SUPERADMIN que ses écrans", () => {
  const atelier = new Set(Object.keys(PERMISSION_PAR_CHEMIN));
  for (const e of etapes("client")) if (e.to) assert.ok(e.to.startsWith("/client") || ["/login", "/mot-de-passe-oublie"].includes(e.to), `client : ${e.to}`);
  const superRoutes = ["/login", "/vue-ensemble", "/ateliers", "/gestion-abonnements", "/paiements-abonnement", "/notifications-plateforme", "/commerce", "/tarifs-abonnement", "/mon-compte"];
  for (const e of etapes("superadmin")) if (e.to) assert.ok(superRoutes.includes(e.to), `superadmin : ${e.to}`);
  for (const e of etapes("pdg")) if (e.to && !["/login", "/inscription"].includes(e.to)) assert.ok(atelier.has(`/${e.to.split("/")[1]}`), `pdg : ${e.to}`);
});

test("liens « ouvrir cet écran » : jamais vers une page publique ni vers un écran interdit", () => {
  assert.equal(lienEtape("pdg", { role: "ADMIN" }, "/login"), null);
  assert.equal(lienEtape("client", { role: "USER" }, "/client/activer"), null);
  assert.equal(lienEtape("pdg", { role: "ADMIN" }, "/commandes"), "/commandes");
  assert.equal(lienEtape("employe", employe(POSTES.COUTURIER, "COUTURIER"), "/stock/nouveau"), "/stock/nouveau");
  assert.equal(lienEtape("employe", employe(["commandes.lire"], "COUTURIER"), "/paiements"), null);
});

// ---------- Rendu des libellés ----------

test("decouper / texteBrut remplacent [[cle]] par le libellé réel", () => {
  assert.deepEqual(decouper("A [[x.y]] B"), [{ texte: "A " }, { ui: "x.y" }, { texte: " B" }]);
  assert.equal(texteBrut("Cliquez sur [[x.y]].", () => "Valider"), "Cliquez sur « Valider ».");
  assert.deepEqual(clesCitees("[[a]] et [[b]]"), ["a", "b"]);
  assert.equal(texteBrut("sans clé", () => "?"), "sans clé");
});

test("les textes ne contiennent aucune clé mal fermée ni espace en trop", () => {
  const defauts = [];
  for (const guide of NOMS_GUIDES) {
    for (const langue of ["fr", "en"]) {
      const json = JSON.stringify(TEXTES[guide][langue]);
      if ((json.match(/\[\[/g) ?? []).length !== (json.match(/\]\]/g) ?? []).length) defauts.push(`${guide}/${langue}: crochets`);
      if (/\[\[\s|\s\]\]/.test(json)) defauts.push(`${guide}/${langue}: espace dans une clé`);
    }
  }
  assert.deepEqual(defauts, []);
});

test("l'étape décrivant l'accueil d'un poste n'est montrée qu'aux employés de ce poste (et sa capture avec elle)", () => {
  // Un réceptionniste à qui l'on accorde le statut des commandes voit la section couturier, mais pas l'accueil du couturier.
  const user = employe([...POSTES.RECEPTIONNISTE, "commandes.statut"], "RECEPTIONNISTE");
  const couturier = sectionsVisibles("employe", user).find((s) => s.id === "couturier");
  assert.ok(couturier);
  assert.ok(!couturier.steps.some((e) => e.id === "travaux"));
  assert.equal(couturier.captureVisible, false);
  // Le couturier, lui, voit l'accueil et sa capture.
  const chezLui = sectionsVisibles("employe", employe(POSTES.COUTURIER, "COUTURIER")).find((s) => s.id === "couturier");
  assert.ok(chezLui.steps.some((e) => e.id === "travaux"));
  assert.equal(chezLui.captureVisible, true);
});
