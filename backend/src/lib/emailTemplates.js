// Gabarits HTML minimalistes — même esprit que les autres documents générés
// par l'app (reçu PDF, etc.) : sobre, lisible, sans dépendance à un service
// de templating externe. Un seul style inline (pas de CSS externe, souvent
// bloqué par les clients email).

const STYLE_BOUTON =
  "display:inline-block;background:#276386;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;";
const STYLE_CORPS = "font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.6;max-width:480px;margin:0 auto;padding:24px;";
const STYLE_PIED = "color:#737373;font-size:12px;margin-top:32px;";

export function emailVerificationTemplate({ prenom, lienVerification }) {
  return `
    <div style="${STYLE_CORPS}">
      <h2>Bienvenue${prenom ? ` ${prenom}` : ""} !</h2>
      <p>Merci d'avoir créé votre atelier sur Gestion d'Atelier. Confirmez votre adresse email en cliquant sur le lien ci-dessous :</p>
      <a href="${lienVerification}" style="${STYLE_BOUTON}">Confirmer mon email</a>
      <p style="${STYLE_PIED}">
        Ce lien expire dans 24 heures. Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email.
      </p>
    </div>
  `;
}

export function emailReinitialisationTemplate({ lienReinitialisation }) {
  return `
    <div style="${STYLE_CORPS}">
      <h2>Réinitialisation de mot de passe</h2>
      <p>Vous avez demandé à réinitialiser votre mot de passe sur Gestion d'Atelier. Cliquez sur le lien ci-dessous pour en choisir un nouveau :</p>
      <a href="${lienReinitialisation}" style="${STYLE_BOUTON}">Réinitialiser mon mot de passe</a>
      <p style="${STYLE_PIED}">
        Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe reste inchangé.
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
    .map((l) => `<div style="${LIGNE_STYLE}"><span>${l.label}</span><strong>${l.nombre}</strong></div>`)
    .join("");

  return `
    <div style="${STYLE_CORPS}">
      <h2>Rappels du jour${prenom ? ` — ${prenom}` : ""}</h2>
      <p>Voici ce qui mérite votre attention aujourd'hui sur votre atelier :</p>
      ${items}
      <a href="${lienNotifications}" style="${STYLE_BOUTON}">Voir le détail</a>
      <p style="${STYLE_PIED}">
        Vous recevez ce résumé une fois par jour tant que des éléments restent à traiter.
      </p>
    </div>
  `;
}
