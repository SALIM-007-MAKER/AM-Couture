import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import {
  traduire,
  normaliserLangue,
  libelleStatut,
  codeNotification,
  messageNotification,
  rendreNotification,
  langueDemandee,
  LANGUES_SERVEUR,
} from "../messagesServeur.js";
import { streamRecuPdf, streamFicheCommandePdf } from "../recuPdf.js";
import { emailVerificationTemplate, emailInvitationClientTemplate, emailReinitialisationTemplate } from "../emailTemplates.js";
import { texteDuPdf } from "./pdfTexte.js";

function pdf(fonction, args) {
  return new Promise((resolve) => {
    const res = new PassThrough();
    res.setHeader = () => {};
    const morceaux = [];
    res.on("data", (c) => morceaux.push(c));
    res.on("end", () => resolve(texteDuPdf(Buffer.concat(morceaux))));
    fonction(res, args);
  });
}
const atelier = { nom: "Atelier", devise: "FCFA", adresse: "Niamey" };
const cliente = { prenom: "Awa", nom: "Diop", telephone: "90000001" };

test("langue inconnue ou non traduite (ex. « de ») : retombe sur le français, jamais de clé brute", () => {
  assert.equal(normaliserLangue("de"), "fr");
  assert.equal(normaliserLangue(undefined), "fr");
  assert.equal(normaliserLangue("en"), "en");
  assert.equal(traduire("de", "notif.RECU_EMIS", { numero: "C1" }), "Un reçu est disponible pour votre commande C1.");
  assert.equal(traduire("en", "cle.inexistante"), "cle.inexistante");
});

test("chaque texte français a son équivalent anglais, avec les mêmes paramètres", () => {
  const FR = traduireToutes("fr");
  const EN = traduireToutes("en");
  assert.deepEqual(Object.keys(EN).sort(), Object.keys(FR).sort());
  for (const [cle, modele] of Object.entries(FR)) {
    const params = (t) => [...t.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(params(EN[cle]), params(modele), `paramètres différents pour ${cle}`);
  }
});

// Les modèles ne sont pas exportés : on les relit en traduisant avec des paramètres nommés d'après eux.
function traduireToutes(langue) {
  const sortie = {};
  for (const cle of CLES) sortie[cle] = traduire(langue, cle, Object.fromEntries(NOMS.map((n) => [n, `{{${n}}}`])));
  return sortie;
}
const NOMS = ["numero", "montant", "statut", "motif", "prenom", "identifiant", "valeur", "verbe", "lieu", "dateHeure", "jour", "heure"];
const CLES = [
  ...["COMMANDE_CREEE", "PAIEMENT_ENREGISTRE", "COMMANDE_STATUT_CHANGE", "COMMANDE_ANNULEE", "LIVRAISON_ENREGISTREE", "RECU_EMIS", "DEMANDE_ACCEPTEE", "DEMANDE_REFUSEE", "DEMANDE_REFUSEE_MOTIF"].map((c) => `notif.${c}`),
  ...["verification", "invitation", "reinitialisation"].flatMap((e) => ["sujet", "titre", "corps", "bouton", "pied"].map((p) => `email.${e}.${p}`)),
  ...["recu", "commande", "client", "details", "commandeNo", "datePaiement", "mode", "reference", "montantPaye", "totalEncaisse", "mentionRecu", "modele", "statut", "livraisonPrevue", "montantTotal", "soldeRestant", "mentionFicheMontants", "mentionFiche", "emisM", "emisF", "emissionLieu", "emissionSans", "dateHeure"].map((c) => `pdf.${c}`),
];

test("message du fil d'activité composé dans la langue, statut traduit", () => {
  assert.equal(messageNotification("COMMANDE_STATUT_CHANGE", { numero: "C7", statut: "EN_CONFECTION" }, "fr"), "Votre commande C7 est maintenant : En confection.");
  assert.equal(messageNotification("COMMANDE_STATUT_CHANGE", { numero: "C7", statut: "EN_CONFECTION" }, "en"), "Your order C7 is now: In production.");
  assert.equal(libelleStatut("INCONNU", "en"), "INCONNU");
  assert.equal(codeNotification("DEMANDE_REFUSEE", { motif: "x" }), "DEMANDE_REFUSEE_MOTIF");
  assert.equal(codeNotification("DEMANDE_REFUSEE", {}), "DEMANDE_REFUSEE");
});

test("ligne antérieure sans code : le texte enregistré est conservé, quelle que soit la langue", () => {
  const ancienne = { code: null, params: null, message: "Ancien texte figé" };
  assert.equal(rendreNotification(ancienne, "en"), "Ancien texte figé");
  assert.equal(rendreNotification({ code: "CODE_QUI_N_EXISTE_PLUS", message: "Texte de secours" }, "en"), "Texte de secours");
  assert.equal(rendreNotification({ code: "RECU_EMIS", params: { numero: "C1" }, message: "fr" }, "en"), "A receipt is available for your order C1.");
});

test("langue d'un document : paramètre valide prioritaire, sinon préférence du compte, sinon français", () => {
  assert.equal(langueDemandee({ query: { langue: "en" }, user: { langue: "fr" } }), "en");
  assert.equal(langueDemandee({ query: { langue: "xx" }, user: { langue: "en" } }), "en");
  assert.equal(langueDemandee({ query: { langue: ["en"] }, user: { langue: "de" } }), "fr");
  assert.equal(langueDemandee({ query: {}, user: {} }), "fr");
  assert.deepEqual(LANGUES_SERVEUR, ["fr", "en"]);
});

test("reçu PDF : français par défaut, anglais sur demande", async () => {
  const recu = { numero: "R-1", createdAt: new Date("2026-11-16T10:00:00Z"), montantPaye: "1500", commande: { numero: "C1", cliente }, paiement: { date: new Date("2026-11-16"), mode: "ESPECES", reference: null } };
  const fr = await pdf(streamRecuPdf, { recu, atelier });
  const en = await pdf(streamRecuPdf, { recu, atelier, langue: "en" });
  assert.match(fr, /REÇU N° R-1/);
  assert.match(fr, /Montant payé/);
  assert.match(en, /RECEIPT NO\. R-1/);
  assert.match(en, /Amount paid/);
  assert.match(en, /November 2026/);
  assert.doesNotMatch(en, /REÇU|Montant payé/);
});

test("fiche commande PDF : statut, type de vêtement et mention dans la langue ; pas de montants sans le droit", async () => {
  const commande = { numero: "C9", createdAt: new Date("2026-11-16T10:00:00Z"), cliente, modele: null, typeVetement: "ROBE", statut: "ESSAYAGE", dateLivraisonPrevue: new Date("2026-12-01"), prixTotal: "10000" };
  const en = await pdf(streamFicheCommandePdf, { commande, atelier, totalPaye: "0", solde: "10000", avecMontants: false, langue: "en" });
  assert.match(en, /ORDER NO\. C9/);
  assert.match(en, /Status: Fitting/);
  assert.match(en, /Model: Dress/);
  assert.match(en, /Automatically generated document\./);
  assert.doesNotMatch(en, /Balance due|10000/);
  const fr = await pdf(streamFicheCommandePdf, { commande, atelier, totalPaye: "0", solde: "10000" });
  assert.match(fr, /Statut : Essayage/);
  assert.match(fr, /Solde restant/);
});

test("courriels : langue du destinataire, valeurs saisies toujours échappées", () => {
  const en = emailVerificationTemplate({ prenom: "<b>Awa</b>", lienVerification: "https://x/y?a=1&b=2", langue: "en" });
  assert.match(en, /Welcome &lt;b&gt;Awa&lt;\/b&gt;!/);
  assert.match(en, /Confirm my email/);
  assert.doesNotMatch(en, /<b>Awa/);
  assert.match(emailVerificationTemplate({ prenom: "Awa", lienVerification: "https://x" }), /Bienvenue Awa !/);
  assert.match(emailInvitationClientTemplate({ prenom: "A", identifiant: "9000", lienActivation: "https://x", langue: "en" }), /phone number \(9000\)/);
  assert.match(emailReinitialisationTemplate({ lienReinitialisation: "https://x", langue: "en" }), /Reset my password/);
  assert.match(emailReinitialisationTemplate({ lienReinitialisation: "https://x", langue: "de" }), /Réinitialiser mon mot de passe/);
});
