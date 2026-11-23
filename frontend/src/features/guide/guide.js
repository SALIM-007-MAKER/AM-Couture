// Logique pure du guide d'utilisation (sans React) : quel guide, quelles sections, comment lire un texte.
import { GUIDES, ROLES_GUIDE } from "./structure.js";
import { peut, peutAcceder } from "../employes/permissions.js";
import { espaceDe } from "../accueil/espaces.js";

/** Guide d'un compte : le rôle seul décide, jamais un paramètre d'adresse. `null` si le compte n'en a pas. */
export function guideDe(user) {
  return ROLES_GUIDE[user?.role] ?? null;
}

const aToutes = (user, permissions) => (permissions ?? []).every((p) => peut(user, p));

/**
 * Sections et étapes montrées à ce compte. Le PDG, le client et le SUPERADMIN voient tout leur guide ; un employé ne voit que
 * ce que ses permissions lui ouvrent (jamais un écran ou une action qu'il ne peut pas utiliser), sa section de poste en premier.
 * Chaque étape garde son numéro d'origine (`numero`) : les numéros des captures annotées en dépendent.
 */
export function sectionsVisibles(guide, user) {
  const sections = GUIDES[guide] ?? [];
  if (guide !== "employe") return sections.map((s) => ({ ...s, captureVisible: true, steps: s.steps.map((e, i) => ({ ...e, numero: i + 1 })) }));

  const monEspace = espaceDe(user);
  const visibles = sections
    .filter((s) => (s.espace === "general" ? monEspace === "general" : aToutes(user, s.permissions)))
    .map((s) => {
      const gardees = s.steps.filter((e) => aToutes(user, e.permissions) && !(e.accueil && s.espace !== monEspace));
      // La capture montre l'accueil de l'espace : elle n'est utile que si toutes les étapes qu'elle annote sont visibles.
      const captureVisible = s.steps.filter((e) => e.cible).every((e) => gardees.includes(e));
      return { ...s, captureVisible, steps: gardees.map((e, i) => ({ ...e, numero: i + 1 })) };
    })
    .filter((s) => s.steps.length > 0);
  const rang = (s) => (!s.espace ? 0 : s.espace === monEspace ? 1 : 2);
  return [...visibles].sort((a, b) => rang(a) - rang(b));
}

// Pages publiques : l'étape s'y déroule avant la connexion, un lien depuis l'espace connecté n'aurait pas de sens.
const PAGES_PUBLIQUES = new Set(["/login", "/inscription", "/mot-de-passe-oublie", "/client/activer"]);

/** Lien « ouvrir cet écran » d'une étape, ou null (page publique, écran absent du menu du compte). */
export function lienEtape(guide, user, to) {
  if (!to || PAGES_PUBLIQUES.has(to)) return null;
  if (guide === "client" || guide === "superadmin") return to;
  return peutAcceder(user, `/${to.split("/")[1] ?? ""}`) ? to : null;
}

/** Découpe un texte en morceaux : { texte } ou { ui: "cle.i18n" } pour chaque [[cle]]. */
export function decouper(texte) {
  const morceaux = [];
  let reste = String(texte);
  for (;;) {
    const debut = reste.indexOf("[[");
    const fin = debut === -1 ? -1 : reste.indexOf("]]", debut);
    if (fin === -1) break;
    if (debut > 0) morceaux.push({ texte: reste.slice(0, debut) });
    morceaux.push({ ui: reste.slice(debut + 2, fin) });
    reste = reste.slice(fin + 2);
  }
  if (reste) morceaux.push({ texte: reste });
  return morceaux;
}

/** Clés d'interface citées par un texte. */
export const clesCitees = (texte) => decouper(texte).filter((m) => m.ui).map((m) => m.ui);

/** Texte brut : chaque [[cle]] remplacée par le libellé réel entre « ». `traduire(cle)` fournit le libellé. */
export function texteBrut(texte, traduire) {
  return decouper(texte).map((m) => (m.ui ? `« ${traduire(m.ui)} »` : m.texte)).join("");
}

// Un module par guide et par langue, chargé à la demande : un compte ne télécharge que son propre guide.
const CHARGEURS = {
  pdg: { fr: () => import("../../i18n/guides/pdg.fr.js"), en: () => import("../../i18n/guides/pdg.en.js") },
  employe: { fr: () => import("../../i18n/guides/employe.fr.js"), en: () => import("../../i18n/guides/employe.en.js") },
  client: { fr: () => import("../../i18n/guides/client.fr.js"), en: () => import("../../i18n/guides/client.en.js") },
  superadmin: { fr: () => import("../../i18n/guides/superadmin.fr.js"), en: () => import("../../i18n/guides/superadmin.en.js") },
};

/** Textes d'un guide dans une langue ; le français sert de repli pour une langue sans guide. */
export async function chargerTextes(guide, langue) {
  const chargeur = CHARGEURS[guide]?.[langue] ?? CHARGEURS[guide]?.fr;
  if (!chargeur) throw new Error(`Guide inconnu : ${guide}`);
  return (await chargeur()).default;
}

export const LANGUES_GUIDE = ["fr", "en"];

/** Adresse d'une capture (dossier public, par langue et par format d'écran). */
export const urlCapture = (langue, id, format) => `/guide/${langue}/${id}-${format}.jpg`;
