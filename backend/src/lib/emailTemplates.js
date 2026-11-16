// Gabarits HTML minimalistes — même esprit que les autres documents générés
// par l'app (reçu PDF, etc.) : sobre, lisible, sans dépendance à un service
// de templating externe. Un seul style inline (pas de CSS externe, souvent
// bloqué par les clients email).

// Toute valeur interpolée dans le HTML d'un email passe par esc() : prénoms,
// identifiants et libellés sont saisis par des utilisateurs (inscription, ADMIN
// qui invite un client) — sans échappement, ils pourraient injecter du HTML ou
// des liens dans un email envoyé depuis le domaine de la plateforme (phishing).
export function esc(valeur) {
  return String(valeur ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

import { traduire } from "./messagesServeur.js";

const STYLE_BOUTON =
  "display:inline-block;background:#276386;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;";
const STYLE_CORPS = "font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.6;max-width:480px;margin:0 auto;padding:24px;";
const STYLE_PIED = "color:#737373;font-size:12px;margin-top:32px;";

// 7.7 : `langue` ("fr" par défaut, "en") — la langue de la personne qui reçoit le courriel. Les textes viennent de
// lib/messagesServeur.js ; les valeurs saisies restent échappées par esc().
export function emailVerificationTemplate({ prenom, lienVerification, langue }) {
  const t = (cle, p) => esc(traduire(langue, `email.verification.${cle}`, p));
  return `
    <div style="${STYLE_CORPS}">
      <h2>${t("titre", { prenom: prenom ? ` ${prenom}` : "" })}</h2>
      <p>${t("corps")}</p>
      <a href="${esc(lienVerification)}" style="${STYLE_BOUTON}">${t("bouton")}</a>
      <p style="${STYLE_PIED}">
        ${t("pied")}
      </p>
    </div>
  `;
}

// Invitation d'un client (§ plan rôle USER, Phase 3) — voir POST
// /clientes/:id/inviter (routes/clientes.routes.js). `identifiant` rappelle
// le numéro de téléphone (identifiant de connexion réel, jamais cet email)
// pour éviter toute confusion au moment de se connecter.
export function emailInvitationClientTemplate({ prenom, identifiant, lienActivation, langue }) {
  const t = (cle, p) => esc(traduire(langue, `email.invitation.${cle}`, p));
  return `
    <div style="${STYLE_CORPS}">
      <h2>${t("titre", { prenom: prenom ? ` ${prenom}` : "" })}</h2>
      <p>${t("corps")}</p>
      <a href="${esc(lienActivation)}" style="${STYLE_BOUTON}">${t("bouton")}</a>
      <p style="${STYLE_PIED}">
        ${t("pied", { identifiant })}
      </p>
    </div>
  `;
}

export function emailReinitialisationTemplate({ lienReinitialisation, langue }) {
  const t = (cle) => esc(traduire(langue, `email.reinitialisation.${cle}`));
  return `
    <div style="${STYLE_CORPS}">
      <h2>${t("titre")}</h2>
      <p>${t("corps")}</p>
      <a href="${esc(lienReinitialisation)}" style="${STYLE_BOUTON}">${t("bouton")}</a>
      <p style="${STYLE_PIED}">
        ${t("pied")}
      </p>
    </div>
  `;
}

// Digest quotidien (cron, voir routes/cron.routes.js) — uniquement envoyé
// s'il y a au moins une ligne à signaler (voir appelant) : jamais un email
// "tout va bien" quotidien, seulement de vrais rappels actionnables.
const LIGNE_STYLE = "display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e5e5;";

export function rappelsQuotidiensTemplate({ prenom, lignes, lienNotifications }) {
  const items = lignes
    .filter((l) => l.nombre > 0)
    .map((l) => `<div style="${LIGNE_STYLE}"><span>${esc(l.label)}</span><strong>${esc(l.nombre)}</strong></div>`)
    .join("");

  return `
    <div style="${STYLE_CORPS}">
      <h2>Rappels du jour${prenom ? ` — ${esc(prenom)}` : ""}</h2>
      <p>Voici ce qui mérite votre attention aujourd'hui sur votre atelier :</p>
      ${items}
      <a href="${esc(lienNotifications)}" style="${STYLE_BOUTON}">Voir le détail</a>
      <p style="${STYLE_PIED}">
        Vous recevez ce résumé une fois par jour tant que des éléments restent à traiter.
      </p>
    </div>
  `;
}

// Courriels d'abonnement (rappels avant échéance, décisions sur un paiement) : un titre, quelques paragraphes, un
// bouton. Toute valeur interpolée passe par esc().
export function notificationAbonnementTemplate({ prenom, titre, paragraphes, lien, libelleLien }) {
  const corps = paragraphes.map((p) => `<p>${esc(p)}</p>`).join("");
  return `
    <div style="${STYLE_CORPS}">
      <h2>${esc(titre)}${prenom ? ` — ${esc(prenom)}` : ""}</h2>
      ${corps}
      <a href="${esc(lien)}" style="${STYLE_BOUTON}">${esc(libelleLien)}</a>
      <p style="${STYLE_PIED}">
        Vous recevez ce message parce que vous administrez un atelier sur Gestion d'Atelier.
      </p>
    </div>
  `;
}
