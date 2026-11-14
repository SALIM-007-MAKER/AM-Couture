import { test } from "node:test";
import assert from "node:assert/strict";
import { securityHeaders, csrfOriginGuard } from "../security.middleware.js";

function fauxReq({ method = "POST", headers = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, get: (n) => h[n.toLowerCase()] };
}
function lancer(mw, req) {
  let erreur = null;
  let suivant = false;
  mw(req, { setHeader() {} }, (e) => {
    if (e) erreur = e;
    else suivant = true;
  });
  return { erreur, suivant };
}

test("securityHeaders pose les en-têtes essentiels", () => {
  const poses = {};
  securityHeaders({}, { setHeader: (k, v) => (poses[k] = v) }, () => {});
  assert.equal(poses["X-Content-Type-Options"], "nosniff");
  assert.equal(poses["X-Frame-Options"], "DENY");
  assert.equal(poses["Cache-Control"], "no-store");
  assert.match(poses["Content-Security-Policy"], /default-src 'none'/);
});

test("CSRF : une écriture depuis un autre site est refusée (403)", () => {
  const r = lancer(csrfOriginGuard, fauxReq({ headers: { Origin: "https://evil.example", Host: "app.example.com" } }));
  assert.equal(r.erreur?.status, 403);
});

test("CSRF : une écriture depuis le même hôte passe", () => {
  const r = lancer(csrfOriginGuard, fauxReq({ headers: { Origin: "https://app.example.com", Host: "app.example.com" } }));
  assert.equal(r.suivant, true);
});

test("CSRF : x-forwarded-host (proxy Vercel) prime sur Host", () => {
  const r = lancer(
    csrfOriginGuard,
    fauxReq({ headers: { Origin: "https://app.example.com", Host: "interne", "X-Forwarded-Host": "app.example.com" } }),
  );
  assert.equal(r.suivant, true);
});

test("CSRF : sans Origin (hors navigateur) ou en lecture, on laisse passer", () => {
  assert.equal(lancer(csrfOriginGuard, fauxReq({ headers: { Host: "a.com" } })).suivant, true);
  assert.equal(lancer(csrfOriginGuard, fauxReq({ method: "GET", headers: { Origin: "https://evil.example", Host: "a.com" } })).suivant, true);
});

test("CSRF : Origin illisible est refusée", () => {
  const r = lancer(csrfOriginGuard, fauxReq({ headers: { Origin: "null", Host: "a.com" } }));
  assert.equal(r.erreur?.status, 403);
});

test("CSRF : localhost accepté hors production uniquement", () => {
  const avant = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    assert.equal(lancer(csrfOriginGuard, fauxReq({ headers: { Origin: "http://localhost:5173", Host: "localhost:4000" } })).suivant, true);
    process.env.NODE_ENV = "production";
    assert.equal(lancer(csrfOriginGuard, fauxReq({ headers: { Origin: "http://localhost:5173", Host: "app.example.com" } })).erreur?.status, 403);
  } finally {
    process.env.NODE_ENV = avant;
  }
});
