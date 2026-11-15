import PDFDocument from "pdfkit";
import { sanitizeForPdf, formatDate } from "./recuPdf.js";

// Justificatif de paiement d'un abonnement AM Couture. Généré à la demande depuis la ligne FactureAbonnement
// (instantané figé à l'émission), jamais stocké.
//
// Ce document atteste d'un paiement enregistré par la plateforme. Il ne porte volontairement AUCUNE mention légale
// que le dépôt ne connaît pas (identifiant fiscal, registre de commerce, adresse du siège) : elles sont à renseigner
// par l'exploitant de la plateforme dans EMETTEUR ci-dessous avant tout usage comptable (voir docs/ABONNEMENTS.md).
const EMETTEUR = { nom: "AM Couture", lignes: [] };
const OR = "#B8912F";
const SOMBRE = "#1A1A1A";
const GRIS = "#4A4A4A";

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

export function streamFacturePdf(res, { facture }) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${facture.numero}.pdf"`);

  const doc = new PDFDocument({ size: "A5", margin: 40 });
  doc.pipe(res);

  doc.font("Times-Bold").fontSize(24).fillColor(OR).text(sanitizeForPdf(EMETTEUR.nom), { align: "center" });
  doc.fillColor(GRIS).font("Helvetica").fontSize(9);
  for (const l of EMETTEUR.lignes) doc.text(sanitizeForPdf(l), { align: "center" });
  doc.moveDown(1);

  doc.fillColor(SOMBRE).font("Helvetica-Bold").fontSize(13).text("JUSTIFICATIF DE PAIEMENT D'ABONNEMENT", { align: "center" });
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(11).text(`N° ${sanitizeForPdf(facture.numero)}`, { align: "center" });
  doc.fontSize(9).fillColor(GRIS).text(`Émis le ${formatDate(facture.emisLe)}`, { align: "center" });
  doc.moveDown(1.2);

  doc.fillColor(SOMBRE).fontSize(10);
  for (const [label, valeur] of lignesFacture(facture)) {
    doc.font("Helvetica-Bold").text(`${label} : `, { continued: true }).font("Helvetica").text(sanitizeForPdf(valeur));
    doc.moveDown(0.25);
  }

  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(15).fillColor(SOMBRE).text(`Montant réglé : ${sanitizeForPdf(`${facture.montant} ${facture.devise}`)}`, {
    align: "center",
  });

  if (facture.annuleeLe) {
    doc.moveDown(1);
    doc.fillColor("#B00020").fontSize(12).text(`ANNULÉE (paiement remboursé) le ${formatDate(facture.annuleeLe)}`, { align: "center" });
    if (facture.annuleeMotif) doc.fontSize(9).text(sanitizeForPdf(facture.annuleeMotif), { align: "center" });
  }

  doc.end();
}
