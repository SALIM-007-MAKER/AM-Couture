import PDFDocument from "pdfkit";

// Génération des PDF (Reçu, Fiche commande) — pdfkit uniquement (pur
// JavaScript, aucun binaire/navigateur headless), générés à la volée à
// chaque téléchargement et jamais persistés (pas de Vercel Blob configuré à
// ce stade du projet).
//
// Habillage visuel commun aux deux documents (voir demande explicite d'un
// rendu "carte de visite haut de gamme") : coins ornementaux dorés, titre en
// serif doré, encadrés pour chaque section, QR code de renvoi vers l'app en
// pied de page — volontairement des constantes fixes (identité visuelle du
// document, pas un réglage métier configurable).
const OR = "#B8912F";
const SOMBRE = "#1A1A1A";
const GRIS = "#4A4A4A";

function formatDate(date) {
  return new Date(date).toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateHeure(date) {
  const d = new Date(date);
  const jour = formatDate(d);
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${jour} à ${heure}`;
}

// Mention "Émis à <lieu> le <date> à <heure>" — lieu = Atelier.adresse (pas
// de champ "ville" dédié, voir Phase 2/6 : l'adresse le contient déjà, ex.
// "niamey 2000"). Sans adresse configurée, dégrade proprement en omettant
// le lieu plutôt que d'afficher "Émis à  le...".
function formatEmission(date, atelier, { feminin = false } = {}) {
  const verbe = feminin ? "Émise" : "Émis";
  const dateHeure = formatDateHeure(date);
  const lieu = atelier?.adresse ? sanitizeForPdf(atelier.adresse) : null;
  return lieu ? `${verbe} à ${lieu} le ${dateHeure}` : `${verbe} le ${dateHeure}`;
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

// pdfkit n'embarque nativement que PNG/JPEG (voir doc pdfkit — pas de
// support GIF/WEBP), alors qu'optionalImageField() (zodHelpers.js) accepte
// aussi ces deux formats pour l'upload. On ne tente donc le décodage que
// pour png/jpeg ; tout le reste (webp, gif, ou une ancienne valeur
// http(s):// conservée pour compatibilité — voir optionalImageField) est
// ignoré silencieusement : le PDF reste utilisable sans logo plutôt que de
// planter sur un format que pdfkit ne sait pas lire.
const EMBEDDABLE_LOGO_RE = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/]+=*)$/i;

function decodeEmbeddableLogo(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = dataUrl.match(EMBEDDABLE_LOGO_RE);
  if (!match) return null;
  try {
    return Buffer.from(match[2], "base64");
  } catch {
    return null;
  }
}

/**
 * Logo atelier, centré, en haut du document. `doc.image(buf, x, y, ...)`
 * avec x/y explicites ne fait PAS avancer le curseur `doc.y` comme le
 * ferait du texte : on le repositionne nous-mêmes après coup pour que le
 * contenu suivant ne chevauche pas le logo.
 */
function drawLogo(doc, atelier) {
  const buffer = decodeEmbeddableLogo(atelier?.logoUrl);
  if (!buffer) return;
  try {
    const size = 64;
    const x = (doc.page.width - size) / 2;
    const y = doc.y;
    doc.image(buffer, x, y, { fit: [size, size], align: "center" });
    doc.y = y + size + 10;
  } catch {
    // Data URL valide mais contenu image corrompu/non décodable par pdfkit
    // malgré le sniff mime ci-dessus — on continue sans logo.
  }
}

// Coins ornementaux dorés — purs traits vectoriels (aucune image), dessinés
// dans la marge de page hors de la zone de contenu (voir `margin` du
// PDFDocument). Décoratif uniquement : n'affecte jamais le positionnement du
// contenu (doc.y).
function drawCornerOrnaments(doc) {
  const m = 16;
  const grand = 28;
  const petit = 8;
  const decalage = 7;
  const { width, height } = doc.page;
  const coins = [
    { x: m, y: m, dx: 1, dy: 1 },
    { x: width - m, y: m, dx: -1, dy: 1 },
    { x: m, y: height - m, dx: 1, dy: -1 },
    { x: width - m, y: height - m, dx: -1, dy: -1 },
  ];
  doc.lineWidth(1.1).strokeColor(OR);
  for (const c of coins) {
    doc
      .moveTo(c.x, c.y + c.dy * grand)
      .lineTo(c.x, c.y)
      .lineTo(c.x + c.dx * grand, c.y)
      .stroke();
    const sx = c.dx > 0 ? c.x + c.dx * decalage : c.x + c.dx * decalage - petit;
    const sy = c.dy > 0 ? c.y + c.dy * decalage : c.y + c.dy * decalage - petit;
    doc.rect(sx, sy, petit, petit).stroke();
  }
  doc.strokeColor("black").lineWidth(1);
}

// Barre pleine dorée (pas un simple filet) — sépare l'en-tête atelier du
// corps du document, reprise entre les sections principales.
function drawBarreOr(doc, { hauteur = 2.5, marge = 1 } = {}) {
  const x = doc.page.margins.left + marge;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right - marge * 2;
  doc.rect(x, doc.y, width, hauteur).fill(OR);
  doc.fillColor(SOMBRE);
  doc.y += hauteur + 10;
}

/**
 * En-tête commun (logo, nom en doré, slogan, coordonnées, barre dorée) —
 * partagé entre Reçu et Fiche commande.
 */
function drawEnTete(doc, atelier) {
  // `atelier.nom` est un champ requis en base (jamais vide pour un atelier
  // réel, voir schema.prisma) — ce repli générique ne sert qu'à ne jamais
  // afficher un nom de tenant à la place d'un autre (Phase 8, multi-atelier).
  const nomAtelier = sanitizeForPdf(atelier?.nom || "Atelier");
  drawLogo(doc, atelier);
  doc.font("Times-Bold").fontSize(24).fillColor(OR).text(nomAtelier, { align: "center" });
  doc.fillColor(SOMBRE).font("Helvetica").fontSize(9.5);
  doc.moveDown(0.3);
  if (atelier?.slogan) doc.text(sanitizeForPdf(atelier.slogan), { align: "center" });
  const coordonnees = [atelier?.adresse, atelier?.telephone].filter(Boolean).map(sanitizeForPdf).join(" — ");
  if (coordonnees) doc.text(coordonnees, { align: "center" });
  doc.moveDown(0.8);
  drawBarreOr(doc);
}

/**
 * Section encadrée simple (bordure fine) — titre en gras optionnel suivi de
 * lignes de texte. Utilisée pour "Client".
 */
function drawSectionEncadree(doc, title, lignes) {
  const x = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const padding = 8;
  const startY = doc.y;
  doc.font("Helvetica-Bold").fontSize(11).fillColor(SOMBRE).text(title, x + padding, startY + padding, {
    width: width - padding * 2,
  });
  doc.font("Helvetica").fontSize(10);
  for (const ligne of lignes) {
    doc.text(ligne, x + padding, doc.y + 1, { width: width - padding * 2 });
  }
  const endY = doc.y + padding;
  doc.lineWidth(0.75).strokeColor("#333333").rect(x, startY, width, endY - startY).stroke();
  doc.strokeColor("black").lineWidth(1);
  doc.y = endY + 10;
}

// Lignes tabulaires encadrées, empilées (bordures partagées) — "Détails".
function drawLignesTableau(doc, lignes) {
  const x = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const padding = 8;
  const hauteurLigne = 24;
  doc.font("Helvetica").fontSize(10).fillColor(SOMBRE);
  let y = doc.y;
  for (const ligne of lignes) {
    doc.lineWidth(0.75).strokeColor("#333333").rect(x, y, width, hauteurLigne).stroke();
    doc.text(ligne, x + padding, y + hauteurLigne / 2 - 5, { width: width - padding * 2 });
    y += hauteurLigne;
  }
  doc.strokeColor("black").lineWidth(1);
  doc.y = y + 10;
}

/**
 * Encadré double bordure (externe sombre, interne dorée) mettant en avant
 * les montants — dernière ligne en plus gros/gras (solde restant, ou
 * montant payé si une seule ligne).
 */
function drawEncadreMontants(doc, lignes) {
  const x = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const padding = 12;
  const startY = doc.y;
  let y = startY + padding;
  lignes.forEach(({ label, valeur, taille = 11, gras = true }, i) => {
    if (i > 0) y += 4;
    doc.font(gras ? "Helvetica-Bold" : "Helvetica").fontSize(taille).fillColor(SOMBRE);
    doc.text(`${label} : `, x + padding, y, { continued: true, width: width - padding * 2 });
    doc.text(valeur);
    y = doc.y;
  });
  const endY = y + padding;
  const hauteur = endY - startY;
  doc.lineWidth(1.5).strokeColor(SOMBRE).rect(x, startY, width, hauteur).stroke();
  const inset = 4;
  doc.lineWidth(1).strokeColor(OR).rect(x + inset, startY + inset, width - inset * 2, hauteur - inset * 2).stroke();
  doc.strokeColor("black").lineWidth(1);
  doc.y = endY + 12;
}

/**
 * Pied de page commun : simple mention, positionnée près du bas de page
 * (position absolue) plutôt qu'à la suite du contenu, pour un rendu
 * constant quelle que soit la longueur du corps du document.
 *
 * Un QR code + URL de renvoi vers l'app avait été ajouté puis retiré : en
 * environnement de développement il affichait l'adresse locale
 * ("localhost:4000"), inutilisable et déroutante sur un document destiné à
 * une cliente — et en production il ne pointait de toute façon que vers
 * l'accueil générique de l'app (aucune page publique par commande/reçu
 * n'existe), donc peu de valeur réelle pour la complexité ajoutée.
 */
function drawPiedDePage(doc, { mention }) {
  const yCible = doc.page.height - doc.page.margins.bottom - 40;
  doc.y = Math.max(doc.y + 12, yCible);
  doc.fontSize(8).font("Helvetica-Oblique").fillColor(GRIS).text(mention, { align: "center" });
  doc.fillColor("black");
}

/**
 * Écrit le PDF du reçu directement dans la réponse HTTP (stream).
 * Doit être appelé APRÈS toute validation (404 etc.) : une fois cette
 * fonction invoquée, les en-têtes HTTP sont envoyés et il n'est plus
 * possible de répondre avec une erreur JSON classique.
 */
export function streamRecuPdf(res, { recu, atelier }) {
  const devise = sanitizeForPdf(atelier?.devise || "FCFA");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${recu.numero}.pdf"`);

  const doc = new PDFDocument({ size: "A5", margin: 40 });
  doc.pipe(res);

  drawCornerOrnaments(doc);
  drawEnTete(doc, atelier);

  doc.font("Helvetica-Bold").fontSize(14).text(`REÇU N° ${sanitizeForPdf(recu.numero)}`, { align: "center" });
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(10).text(formatEmission(recu.createdAt, atelier), { align: "center" });
  doc.moveDown(1.2);

  const cliente = recu.commande?.cliente;
  const ligneClient = [
    cliente ? sanitizeForPdf(`${cliente.prenom} ${cliente.nom}`) : "—",
    cliente?.telephone ? sanitizeForPdf(cliente.telephone) : null,
  ].filter(Boolean);
  drawSectionEncadree(doc, "Client", ligneClient);

  const lignesDetails = [`Commande N° ${sanitizeForPdf(recu.commande?.numero ?? "—")}`];
  if (recu.paiement) {
    lignesDetails.push(`Date paiement : ${formatDate(recu.paiement.date)}`);
    lignesDetails.push(`Mode : ${sanitizeForPdf(recu.paiement.mode)}`);
    if (recu.paiement.reference) lignesDetails.push(`Référence : ${sanitizeForPdf(recu.paiement.reference)}`);
  }
  drawLignesTableau(doc, lignesDetails);

  const libelleMontant = recu.paiement ? "Montant payé" : "Total encaissé à ce jour";
  drawEncadreMontants(doc, [{ label: libelleMontant, valeur: formatMontant(recu.montantPaye, devise), taille: 14 }]);

  if (isNonEmptyRecuConfig(atelier?.recuConfig)) {
    doc.font("Helvetica").fontSize(9);
    for (const [cle, valeur] of Object.entries(atelier.recuConfig)) {
      if (valeur === null || valeur === "") continue;
      doc.font("Helvetica-Bold").text(sanitizeForPdf(cle), { continued: true });
      doc.font("Helvetica").text(` : ${sanitizeForPdf(valeur)}`);
    }
    doc.moveDown(0.4);
  }

  drawPiedDePage(doc, { mention: "Document généré automatiquement — conserver comme preuve de paiement." });

  doc.end();
}

// Copie de présentation de frontend/src/features/commandes/constants.js
// (STATUTS_COMMANDE) — à garder synchronisée si l'enum change. Le backend ne
// peut pas importer un module frontend, d'où cette duplication volontaire et
// minimale (7 libellés fixes), plutôt qu'un partage de code cross-bundle.
const STATUT_LABELS = {
  NOUVELLE: "Nouvelle",
  EN_CONFECTION: "En confection",
  ESSAYAGE: "Essayage",
  RETOUCHES: "Retouches",
  TERMINEE: "Terminée",
  LIVREE: "Livrée",
  ANNULEE: "Annulée",
};

// Copie de présentation de frontend/src/features/modeles/constants.js
// (CATEGORIES_VETEMENT) — utilisée uniquement en repli quand la commande
// n'a pas de modèle de catalogue associé (commande sur mesure directe).
const TYPE_VETEMENT_LABELS = {
  ROBE: "Robe",
  BOUBOU: "Boubou",
  ENSEMBLE: "Ensemble",
  PANTALON: "Pantalon",
  CHEMISE: "Chemise",
  JUPE: "Jupe",
  KAFTAN: "Kaftan",
  COSTUME: "Costume",
  TENUE_TRADITIONNELLE: "Tenue traditionnelle",
  AUTRE: "Autre",
};

/**
 * Fiche commande — document DISTINCT du Reçu ci-dessus (voir décision Phase
 * 3) : pas un justificatif de paiement figé, mais un instantané de l'état
 * ACTUEL de la commande (statut, solde) à partager avec la cliente. Régénéré
 * à chaque appel à partir de données calculées en direct (totalPaye/solde
 * passés en paramètres, jamais stockés — voir computeSolde/statutPaiement,
 * commandes.routes.js) : jamais persisté, comme le Reçu.
 */
export function streamFicheCommandePdf(res, { commande, atelier, totalPaye, solde }) {
  const devise = sanitizeForPdf(atelier?.devise || "FCFA");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${commande.numero}.pdf"`);

  const doc = new PDFDocument({ size: "A5", margin: 40 });
  doc.pipe(res);

  drawCornerOrnaments(doc);
  drawEnTete(doc, atelier);

  doc.font("Helvetica-Bold").fontSize(14).text(`COMMANDE N° ${sanitizeForPdf(commande.numero)}`, { align: "center" });
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(10).text(formatEmission(commande.createdAt, atelier, { feminin: true }), { align: "center" });
  doc.moveDown(1.2);

  const cliente = commande.cliente;
  const ligneClient = [
    cliente ? sanitizeForPdf(`${cliente.prenom} ${cliente.nom}`) : "—",
    cliente?.telephone ? sanitizeForPdf(cliente.telephone) : null,
  ].filter(Boolean);
  drawSectionEncadree(doc, "Client", ligneClient);

  doc.font("Helvetica-Bold").fontSize(11).fillColor(SOMBRE).text("Détails");
  doc.moveDown(0.3);
  const modeleLabel = commande.modele?.nom || TYPE_VETEMENT_LABELS[commande.typeVetement] || commande.typeVetement;
  drawLignesTableau(doc, [
    `Modèle : ${sanitizeForPdf(modeleLabel)}`,
    `Statut : ${sanitizeForPdf(STATUT_LABELS[commande.statut] || commande.statut)}`,
    `Livraison prévue : ${formatDate(commande.dateLivraisonPrevue)}`,
  ]);

  drawEncadreMontants(doc, [
    { label: "Montant total", valeur: formatMontant(commande.prixTotal, devise), taille: 11 },
    { label: "Montant payé", valeur: formatMontant(totalPaye, devise), taille: 11 },
    { label: "Solde restant", valeur: formatMontant(solde, devise), taille: 15 },
  ]);

  drawPiedDePage(doc, { mention: "Document généré automatiquement — montants à jour au moment de l'émission." });

  doc.end();
}
