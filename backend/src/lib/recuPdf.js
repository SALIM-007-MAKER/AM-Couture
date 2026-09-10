import PDFDocument from "pdfkit";

// Génération du PDF d'un Reçu — pdfkit uniquement (pur JavaScript, aucun
// binaire/navigateur headless), généré à la volée à chaque téléchargement et
// jamais persisté (pas de Vercel Blob configuré à ce stade du projet).
//
// Volontairement minimal : seules les données réellement stockées sur le
// Reçu (et les enregistrements qu'il référence) sont affichées. Aucune
// valeur "recalculée en direct" qui pourrait diverger de ce qui était vrai
// au moment de l'émission du reçu (ex : pas de "solde restant" live sur un
// reçu lié à un paiement précis — ce chiffre n'est pas stocké sur le Reçu et
// pourrait avoir changé depuis).

function formatDate(date) {
  return new Date(date).toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatMontant(montant, devise) {
  return `${montant} ${devise}`;
}

// Les polices standard pdfkit (Helvetica...) utilisent l'encodage WinAnsi
// (Windows-1252) : ASCII + Latin-1 (accents français compris) + un bloc de
// ponctuation/symboles "intelligente" (guillemets courbes, tiret cadratin,
// puce, €...). Tout caractère HORS de cet ensemble n'est pas rejeté par
// pdfkit — il est silencieusement mal interprété et produit un caractère
// visuellement corrompu sur le PDF (trouvé en testant recuConfig avec "≥" :
// rendu "«e" au lieu de "≥"). Comme recuConfig (et plus généralement
// atelier/cliente/paiement) contient du texte saisi librement, on
// assainit tout ce qui est injecté dans le PDF plutôt que d'espérer que
// personne ne tape jamais un symbole hors Latin-1.
const WINANSI_EXTRA_CODEPOINTS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018,
  0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);
const PDF_SYMBOL_FALLBACKS = {
  "≥": ">=",
  "≤": "<=",
  "→": "->",
  "←": "<-",
  "✓": "OK",
  "✔": "OK",
  "✗": "X",
  "✘": "X",
};

function sanitizeForPdf(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  let out = "";
  for (const ch of str) {
    if (PDF_SYMBOL_FALLBACKS[ch]) {
      out += PDF_SYMBOL_FALLBACKS[ch];
      continue;
    }
    const code = ch.codePointAt(0);
    const isAscii = code >= 0x20 && code <= 0x7e;
    const isLatin1Supplement = code >= 0xa0 && code <= 0xff;
    if (isAscii || isLatin1Supplement || WINANSI_EXTRA_CODEPOINTS.has(code)) {
      out += ch;
    } else {
      out += "?";
    }
  }
  return out;
}

/**
 * `Atelier.recuConfig` (voir atelier.schema.js) : objet plat {clé: valeur}
 * saisi librement par l'atelier via Paramètres — mentions légales, RIB/mobile
 * money, ou tout autre champ jugé utile. Aucune clé n'a de sens réservé côté
 * backend : chaque paire est affichée telle quelle, dans l'ordre de saisie,
 * sous un intitulé générique. C'est le libellé de la clé, choisi par
 * l'atelier, qui porte le sens ("Orange Money", "Mentions légales", etc.).
 */
function isNonEmptyRecuConfig(recuConfig) {
  return recuConfig && typeof recuConfig === "object" && Object.keys(recuConfig).length > 0;
}

/**
 * Écrit le PDF du reçu directement dans la réponse HTTP (stream).
 * Doit être appelé APRÈS toute validation (404 etc.) : une fois cette
 * fonction invoquée, les en-têtes HTTP sont envoyés et il n'est plus
 * possible de répondre avec une erreur JSON classique.
 */
export function streamRecuPdf(res, { recu, atelier }) {
  const nomAtelier = sanitizeForPdf(atelier?.nom || "AM Couture");
  const devise = sanitizeForPdf(atelier?.devise || "FCFA");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${recu.numero}.pdf"`);

  const doc = new PDFDocument({ size: "A5", margin: 40 });
  doc.pipe(res);

  // En-tête atelier
  doc.fontSize(18).font("Helvetica-Bold").text(nomAtelier, { align: "center" });
  doc.moveDown(0.2);
  doc.fontSize(9).font("Helvetica");
  if (atelier?.slogan) doc.text(sanitizeForPdf(atelier.slogan), { align: "center" });
  const coordonnees = [atelier?.adresse, atelier?.telephone].filter(Boolean).map(sanitizeForPdf).join(" — ");
  if (coordonnees) doc.text(coordonnees, { align: "center" });

  doc.moveDown(1);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(1);

  // Titre + numéro
  doc.fontSize(14).font("Helvetica-Bold").text(`REÇU N° ${recu.numero}`, { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica").text(`Émis le ${formatDate(recu.createdAt)}`, { align: "center" });
  doc.moveDown(1.5);

  // Cliente / commande
  const cliente = recu.commande?.cliente;
  doc.fontSize(11).font("Helvetica-Bold").text("Client");
  doc.font("Helvetica").fontSize(10);
  doc.text(cliente ? sanitizeForPdf(`${cliente.prenom} ${cliente.nom}`) : "—");
  if (cliente?.telephone) doc.text(sanitizeForPdf(cliente.telephone));
  doc.moveDown(0.8);

  doc.font("Helvetica-Bold").fontSize(11).text("Commande");
  doc.font("Helvetica").fontSize(10);
  doc.text(`N° ${sanitizeForPdf(recu.commande?.numero ?? "—")}`);
  doc.moveDown(1.2);

  // Détail du paiement lié, si ce reçu concerne un paiement précis
  if (recu.paiement) {
    doc.font("Helvetica-Bold").fontSize(11).text("Paiement");
    doc.font("Helvetica").fontSize(10);
    doc.text(`Date : ${formatDate(recu.paiement.date)}`);
    doc.text(`Mode : ${sanitizeForPdf(recu.paiement.mode)}`);
    if (recu.paiement.reference) doc.text(`Référence : ${sanitizeForPdf(recu.paiement.reference)}`);
    doc.moveDown(1.2);
  }

  // Montant — mis en avant
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.6);
  const libelleMontant = recu.paiement ? "Montant payé" : "Total encaissé à ce jour";
  doc.fontSize(11).font("Helvetica-Bold").text(libelleMontant, { continued: false });
  doc.fontSize(16).text(formatMontant(recu.montantPaye, devise));

  // Informations complémentaires de l'atelier (recuConfig) — affichées juste
  // avant la mention finale, uniquement si l'atelier en a saisi.
  if (isNonEmptyRecuConfig(atelier?.recuConfig)) {
    doc.moveDown(1.2);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
    doc.moveDown(0.6);
    doc.fontSize(9).font("Helvetica");
    for (const [cle, valeur] of Object.entries(atelier.recuConfig)) {
      if (valeur === null || valeur === "") continue;
      doc.font("Helvetica-Bold").text(sanitizeForPdf(cle), { continued: true });
      doc.font("Helvetica").text(` : ${sanitizeForPdf(valeur)}`);
    }
  }

  doc.moveDown(1.5);
  doc.fontSize(8).font("Helvetica-Oblique").text("Document généré automatiquement — conserver comme preuve de paiement.", {
    align: "center",
  });

  doc.end();
}
