import PDFDocument from "pdfkit";
import { sanitizeForPdf, formatDate } from "./recuPdf.js";
import { LOGO_TAILORA_PNG } from "./logoTailora.js";

// Justificatif de paiement d'un abonnement Tailora. Généré à la demande depuis la ligne FactureAbonnement
// (instantané figé à l'émission), jamais stocké.
//
// Ce document atteste d'un paiement enregistré par la plateforme. Il ne porte volontairement AUCUNE mention légale
// que le dépôt ne connaît pas (identifiant fiscal, registre de commerce, adresse du siège, TVA) : elles sont à renseigner
// par l'exploitant de la plateforme dans EMETTEUR ci-dessous avant tout usage comptable (voir docs/ABONNEMENTS.md).
// Chaque ligne de `lignes` apparaît sous le nom de l'émetteur, dans l'en-tête et dans le bloc « Émetteur ».
const EMETTEUR = { nom: "Tailora", lignes: [] };
const OR = "#B8912F";
const OR_CLAIR = "#F7F1E1";
const SOMBRE = "#1A1A1A";
const GRIS = "#4A4A4A";
const GRIS_CLAIR = "#E4E1D8";
const VERT = "#1E7B45";
const ROUGE = "#B00020";

const LIBELLES_MOYEN = {
  WAVE: "Wave",
  NITA: "NITA",
  AMANA: "Amana",
  MOBILE_MONEY: "Mobile money",
  ESPECES: "Espèces",
  VIREMENT: "Virement",
  AUTRE: "Autre",
};

export function lignesFacture(facture) {
  const lignes = [
    ["Atelier", facture.atelierNom],
    ["Formule", facture.planNom ?? "—"],
    ["Durée", facture.dureeMois ? `${facture.dureeMois} mois` : "—"],
    [
      "Période couverte",
      facture.periodeDebut && facture.periodeFin ? `du ${formatDate(facture.periodeDebut)} au ${formatDate(facture.periodeFin)}` : "—",
    ],
    ["Moyen de paiement", LIBELLES_MOYEN[facture.moyenPaiement] ?? facture.moyenPaiement],
  ];
  if (facture.referencePaiement) lignes.push(["Référence du paiement", facture.referencePaiement]);
  return lignes;
}

/** « 5000 » -> « 5 000 », « 12500.5 » -> « 12 500,50 ». Espace ordinaire : l'espace fine du français n'existe pas en WinAnsi. */
export function formaterMontant(valeur) {
  const [entier, decimales] = String(valeur).split(".");
  const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const dec = decimales && Number(decimales) !== 0 ? `,${decimales.padEnd(2, "0").slice(0, 2)}` : "";
  return `${groupe}${dec}`;
}

export function streamFacturePdf(res, { facture }) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${facture.numero}.pdf"`);

  const MARGE = 50;
  const doc = new PDFDocument({ size: "A4", margin: MARGE, info: { Title: `Justificatif ${facture.numero}`, Author: EMETTEUR.nom } });
  doc.pipe(res);
  const L = doc.page.width - 2 * MARGE; // largeur utile
  const droite = MARGE + L;
  const annulee = Boolean(facture.annuleeLe);
  const montant = `${formaterMontant(facture.montant)} ${facture.devise}`;

  // Bandeau doré en haut de page.
  doc.rect(0, 0, doc.page.width, 10).fill(OR);

  // En-tête : marque à gauche, titre et numéro à droite.
  // Logo Tailora (il porte déjà le nom et le slogan). Si l'image ne peut pas être lue, retour au nom en texte : le PDF reste émis.
  try {
    doc.image(LOGO_TAILORA_PNG, MARGE - 8, 20, { fit: [104, 104] });
  } catch {
    doc.font("Times-Bold").fontSize(30).fillColor(OR).text(sanitizeForPdf(EMETTEUR.nom), MARGE, 38, { lineBreak: false });
    doc.font("Helvetica").fontSize(9).fillColor(GRIS).text("Gestion d'atelier de couture", MARGE, 74, { lineBreak: false });
  }

  doc.font("Helvetica-Bold").fontSize(15).fillColor(SOMBRE).text("JUSTIFICATIF DE PAIEMENT", MARGE, 40, { width: L, align: "right", lineBreak: false });
  doc.font("Helvetica").fontSize(10).fillColor(GRIS).text("Abonnement", MARGE, 60, { width: L, align: "right", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(SOMBRE).text(`N° ${sanitizeForPdf(facture.numero)}`, MARGE, 76, { width: L, align: "right", lineBreak: false });
  doc.font("Helvetica").fontSize(9).fillColor(GRIS).text(`Émis le ${formatDate(facture.emisLe)}`, MARGE, 92, { width: L, align: "right", lineBreak: false });

  doc.moveTo(MARGE, 130).lineTo(droite, 130).lineWidth(1.2).strokeColor(OR).stroke();

  // Émetteur / Facturé à.
  const yBlocs = 148;
  const moitie = (L - 20) / 2;
  const bloc = (x, titre, nom, details) => {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(OR).text(titre, x, yBlocs, { width: moitie, characterSpacing: 1, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(SOMBRE).text(sanitizeForPdf(nom), x, yBlocs + 16, { width: moitie });
    doc.font("Helvetica").fontSize(9).fillColor(GRIS);
    for (const d of details) doc.text(sanitizeForPdf(d), x, doc.y + 1, { width: moitie });
  };
  bloc(MARGE, "ÉMETTEUR", EMETTEUR.nom, EMETTEUR.lignes);
  bloc(MARGE + moitie + 20, "FACTURÉ À", facture.atelierNom, ["Atelier abonné à Tailora"]);

  // Tableau : désignation, période, durée, montant.
  const yTable = 228;
  const cols = [
    { titre: "DÉSIGNATION", w: 165, align: "left" },
    { titre: "PÉRIODE COUVERTE", w: 160, align: "left" },
    { titre: "DURÉE", w: 62, align: "left" },
    { titre: "MONTANT", w: L - 165 - 160 - 62, align: "right" },
  ];
  const PAD = 8;
  doc.rect(MARGE, yTable, L, 24).fill(SOMBRE);
  let x = MARGE;
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF");
  for (const c of cols) {
    doc.text(c.titre, x + PAD, yTable + 8, { width: c.w - 2 * PAD, align: c.align, characterSpacing: 0.8, lineBreak: false });
    x += c.w;
  }

  const periode =
    facture.periodeDebut && facture.periodeFin ? [`Du ${formatDate(facture.periodeDebut)}`, `au ${formatDate(facture.periodeFin)}`] : ["—"];
  const cellules = [
    ["Abonnement Tailora", `Formule ${facture.planNom ?? "—"}`],
    periode,
    [facture.dureeMois ? `${facture.dureeMois} mois` : "—"],
    [montant],
  ];
  // Chaque ligne est nettoyée séparément : sanitizeForPdf remplacerait un saut de ligne par « ? ».
  const texte = (c) => c.map((l) => sanitizeForPdf(l)).join("\n");
  doc.font("Helvetica").fontSize(10);
  const hLigne = Math.max(...cellules.map((c, i) => doc.heightOfString(texte(c), { width: cols[i].w - 2 * PAD }))) + 2 * PAD;
  const yLigne = yTable + 24;
  x = MARGE;
  cellules.forEach((c, i) => {
    const gras = i === 3;
    doc.font(gras ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(SOMBRE);
    doc.text(texte(c), x + PAD, yLigne + PAD, { width: cols[i].w - 2 * PAD, align: cols[i].align });
    x += cols[i].w;
  });
  doc.moveTo(MARGE, yLigne + hLigne).lineTo(droite, yLigne + hLigne).lineWidth(0.6).strokeColor(GRIS_CLAIR).stroke();

  // Total réglé.
  const yTotal = yLigne + hLigne + 16;
  const wTotal = 230;
  doc.roundedRect(droite - wTotal, yTotal, wTotal, 52, 4).fill(annulee ? "#FBEAEC" : OR_CLAIR);
  doc.rect(droite - wTotal, yTotal, 4, 52).fill(annulee ? ROUGE : OR);
  doc.font("Helvetica").fontSize(9).fillColor(GRIS).text("TOTAL RÉGLÉ", droite - wTotal + 16, yTotal + 10, { lineBreak: false, characterSpacing: 1 });
  doc.font("Helvetica-Bold").fontSize(19).fillColor(SOMBRE).text(sanitizeForPdf(montant), droite - wTotal + 16, yTotal + 24, { width: wTotal - 28, lineBreak: false });

  // Détails du paiement (à gauche du total).
  const wDetails = L - wTotal - 24;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(OR).text("DÉTAILS DU PAIEMENT", MARGE, yTotal, { width: wDetails, characterSpacing: 1, lineBreak: false });
  let yD = yTotal + 16;
  const details = [
    ["Moyen de paiement", LIBELLES_MOYEN[facture.moyenPaiement] ?? facture.moyenPaiement],
    ...(facture.referencePaiement ? [["Référence", facture.referencePaiement]] : []),
  ];
  for (const [label, valeur] of details) {
    doc.font("Helvetica").fontSize(9).fillColor(GRIS).text(label, MARGE, yD, { width: 95, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(SOMBRE).text(sanitizeForPdf(valeur), MARGE + 95, yD, { width: wDetails - 95, lineBreak: false });
    yD += 15;
  }
  doc.font("Helvetica").fontSize(9).fillColor(GRIS).text("Statut", MARGE, yD, { width: 95, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(9).fillColor(annulee ? ROUGE : VERT).text(annulee ? "ANNULÉ (remboursé)" : "PAYÉ", MARGE + 95, yD, { width: wDetails - 95, lineBreak: false });

  // Bandeau d'annulation : la facture est conservée mais ne vaut plus paiement.
  let yFin = Math.max(yD + 15, yTotal + 52);
  if (annulee) {
    yFin += 20;
    doc.roundedRect(MARGE, yFin, L, 46, 4).lineWidth(1).strokeColor(ROUGE).stroke();
    doc.font("Helvetica-Bold").fontSize(11).fillColor(ROUGE).text(`ANNULÉE : paiement remboursé le ${formatDate(facture.annuleeLe)}`, MARGE + 14, yFin + 10, { width: L - 28, lineBreak: false });
    if (facture.annuleeMotif) doc.font("Helvetica").fontSize(9).text(sanitizeForPdf(facture.annuleeMotif), MARGE + 14, yFin + 27, { width: L - 28, height: 14, ellipsis: true });
  }

  // Pied de page : fixe, au bas de la page (marge basse mise à 0 pour ne jamais provoquer une seconde page).
  doc.page.margins.bottom = 0;
  const yPied = doc.page.height - 64;
  doc.moveTo(MARGE, yPied).lineTo(droite, yPied).lineWidth(0.6).strokeColor(GRIS_CLAIR).stroke();
  doc.font("Helvetica").fontSize(8).fillColor(GRIS);
  doc.text("Ce document atteste d'un paiement enregistré par la plateforme Tailora pour l'abonnement ci-dessus.", MARGE, yPied + 10, { width: L, align: "center", lineBreak: false });
  doc.text(`${sanitizeForPdf(EMETTEUR.nom)}  ·  ${sanitizeForPdf(facture.numero)}`, MARGE, yPied + 24, { width: L, align: "center", lineBreak: false });

  doc.end();
}
