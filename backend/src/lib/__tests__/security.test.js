import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { z } from "zod";

process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/unused"; // jamais connecté : seul hacherToken() est utilisé
process.env.JWT_SECRET ??= "test-secret-unit-tests-0123456789abcdef";

const { nouveauMotDePasseField } = await import("../passwordPolicy.js");
const { signatureImageValide, optionalImageField } = await import("../zodHelpers.js");
const { signAuthToken, verifyAuthToken } = await import("../jwt.js");
const { hacherToken } = await import("../tokenAction.js");

test("mot de passe : trop court, courant ou > 72 octets refusés ; un bon passe", () => {
  assert.equal(nouveauMotDePasseField.safeParse("court").success, false);
  assert.equal(nouveauMotDePasseField.safeParse("Password123").success, false);
  assert.equal(nouveauMotDePasseField.safeParse("a".repeat(73)).success, false);
  assert.equal(nouveauMotDePasseField.safeParse("é".repeat(37)).success, false); // 74 octets
  assert.equal(nouveauMotDePasseField.safeParse("Cousette-Dakar-2026!").success, true);
});

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("image : signature réelle vérifiée, faux PNG refusé", () => {
  assert.equal(signatureImageValide("png", PNG), true);
  assert.equal(signatureImageValide("jpeg", PNG), false);
  const schema = z.object({ img: optionalImageField() });
  assert.equal(schema.safeParse({ img: `data:image/png;base64,${PNG}` }).success, true);
  const faux = Buffer.from("<svg onload=alert(1)>").toString("base64");
  assert.equal(schema.safeParse({ img: `data:image/png;base64,${faux}` }).success, false);
});

test("jwt : jeton signé avec un autre algorithme ou 'none' refusé", () => {
  const ok = signAuthToken({ id: "u1", identifiant: "x", role: "ADMIN", atelierId: "a1", sessionVersion: 0 });
  assert.equal(verifyAuthToken(ok).sub, "u1");
  const none = jwt.sign({ sub: "u1", role: "SUPERADMIN" }, "", { algorithm: "none" });
  assert.throws(() => verifyAuthToken(none), { status: 401 });
  const hs512 = jwt.sign({ sub: "u1" }, process.env.JWT_SECRET, { algorithm: "HS512" });
  assert.throws(() => verifyAuthToken(hs512), { status: 401 });
});

test("jwt : une session d'impersonation expire en 2 h, une session normale en 7 j", () => {
  const u = { id: "u1", identifiant: "x", role: "ADMIN", atelierId: "a1", sessionVersion: 0 };
  const d = (t) => { const p = jwt.decode(t); return p.exp - p.iat; };
  assert.equal(d(signAuthToken(u, { impersonatedBy: "sa" })), 2 * 3600);
  assert.equal(d(signAuthToken(u)), 7 * 24 * 3600);
});

test("jeton d'action : stocké haché (SHA-256), déterministe", () => {
  assert.equal(hacherToken("abc"), crypto.createHash("sha256").update("abc").digest("hex"));
  assert.notEqual(hacherToken("abc"), "abc");
});

// Scripts inline RÉELS d'une page HTML : les commentaires sont retirés d'abord. Un « <script> » cité dans un commentaire n'est pas
// une balise : le prendre pour le début du script donnait le hash d'un faux texte, la CSP bloquait alors le vrai script (le thème
// sombre n'était plus appliqué au chargement) alors que ce test restait vert.
const scriptsInline = (html) => [...html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

test("vercel.json : le hash CSP correspond au script inline de index.html", () => {
  const html = fs.readFileSync(new URL("../../../../frontend/index.html", import.meta.url), "utf8");
  const scripts = scriptsInline(html);
  assert.equal(scripts.length, 1, "un seul script inline attendu (sinon mettre à jour la CSP)");
  assert.ok(scripts[0].includes("am-couture-theme") && scripts[0].trimStart().startsWith("(function"), "le script inline lu n'est pas celui du thème : extraction erronée");
  const hash = "sha256-" + crypto.createHash("sha256").update(scripts[0]).digest("base64");
  const vercel = JSON.parse(fs.readFileSync(new URL("../../../../vercel.json", import.meta.url), "utf8"));
  const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy").value;
  assert.ok(csp.includes(`'${hash}'`), "CSP désynchronisée : recalculer le hash du script inline");
});

test("scriptsInline ignore une balise citée dans un commentaire HTML (régression : thème sombre bloqué par la CSP)", () => {
  const html = '<!-- Doit rester un <script> classique -->\n<script>(function () { /* vrai */ })();</script>';
  assert.deepEqual(scriptsInline(html), ["(function () { /* vrai */ })();"]);
});

// ── CSP : le hash testé doit être celui du script réellement servi ─────────────────────────────────────────────
// Vite recopie le script inline octet pour octet : le hash servi dépend des fins de ligne de la source au moment du build.
const racine = fileURLToPath(new URL("../../../../", import.meta.url));
const hashScriptInline = (html) => {
  const scripts = scriptsInline(html);
  assert.equal(scripts.length, 1, "un seul script inline attendu (sinon mettre à jour la CSP)");
  assert.ok(scripts[0].includes("am-couture-theme") && scripts[0].trimStart().startsWith("(function"), "le script inline lu n'est pas celui du thème : extraction erronée");
  return "sha256-" + crypto.createHash("sha256").update(scripts[0]).digest("base64");
};
const cspVercel = () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(racine, "vercel.json"), "utf8"));
  return vercel.headers.flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy").value;
};

test("CSP : frontend/index.html et vercel.json sont en LF sur le disque (.gitattributes)", () => {
  for (const f of ["frontend/index.html", "vercel.json"]) {
    const contenu = fs.readFileSync(path.join(racine, f), "utf8");
    assert.ok(
      !contenu.includes(String.fromCharCode(13)),
      `${f} contient des CR : le hash CSP du script inline serait faux. Vérifier la règle « text eol=lf » de .gitattributes, puis re-extraire le fichier (git rm --cached + git checkout, ou supprimer le fichier puis git checkout -- ${f}).`,
    );
  }
});

test("CSP : le script inline du build réel (dist/index.html) a un hash présent dans la CSP de vercel.json", () => {
  const sortie = fs.mkdtempSync(path.join(os.tmpdir(), "tailora-csp-"));
  try {
    execFileSync(process.execPath, [path.join(racine, "node_modules/vite/bin/vite.js"), "build", "--outDir", sortie, "--emptyOutDir"], {
      cwd: path.join(racine, "frontend"),
      stdio: "pipe",
    });
    const hash = hashScriptInline(fs.readFileSync(path.join(sortie, "index.html"), "utf8"));
    assert.ok(cspVercel().includes(`'${hash}'`), "CSP désynchronisée : le script inline réellement servi n'a pas le hash déclaré dans vercel.json");
  } finally {
    fs.rmSync(sortie, { recursive: true, force: true });
  }
});
