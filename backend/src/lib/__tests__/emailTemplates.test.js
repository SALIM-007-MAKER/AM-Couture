import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esc,
  emailVerificationTemplate,
  emailInvitationClientTemplate,
  emailReinitialisationTemplate,
  rappelsQuotidiensTemplate,
} from "../emailTemplates.js";

const PIEGE = `<img src=x onerror=alert(1)><a href="https://evil.example">cliquez</a>`;

function assertSansHtmlInjecte(html) {
  assert.equal(html.includes("<img"), false, "balise <img> injectée");
  assert.equal(html.includes('<a href="https://evil.example"'), false, "lien injecté");
  assert.ok(html.includes("&lt;img"), "le texte piégé doit apparaître échappé");
}

test("esc : échappe les 5 caractères sensibles et tolère null/undefined/nombres", () => {
  assert.equal(esc(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
  assert.equal(esc(12), "12");
});

test("vérification email : prénom piégé neutralisé, lien conservé", () => {
  const html = emailVerificationTemplate({ prenom: PIEGE, lienVerification: "https://app.test/verifier-email?token=abc" });
  assertSansHtmlInjecte(html);
  assert.ok(html.includes('href="https://app.test/verifier-email?token=abc"'));
});

test("invitation client : prénom et identifiant piégés neutralisés", () => {
  const html = emailInvitationClientTemplate({ prenom: PIEGE, identifiant: PIEGE, lienActivation: "https://app.test/client/activer?token=abc" });
  assertSansHtmlInjecte(html);
});

test("réinitialisation : un lien contenant un guillemet ne sort pas de l'attribut href", () => {
  const html = emailReinitialisationTemplate({ lienReinitialisation: 'https://app.test/x?token=a"onmouseover="alert(1)' });
  assert.equal(html.includes('"onmouseover="'), false);
});

test("rappels quotidiens : libellés et prénom piégés neutralisés, lignes à zéro masquées", () => {
  const html = rappelsQuotidiensTemplate({
    prenom: PIEGE,
    lignes: [{ label: PIEGE, nombre: 2 }, { label: "Masquée", nombre: 0 }],
    lienNotifications: "https://app.test/notifications",
  });
  assertSansHtmlInjecte(html);
  assert.equal(html.includes("Masquée"), false);
});
