// Extrait le texte d'un PDF produit par pdfkit (flux compressés, texte en hexadécimal) — pour vérifier la LANGUE d'un document
// dans les tests. Volontairement minimal : suffisant pour les polices standard utilisées par recuPdf.js.
import zlib from "node:zlib";

export function texteDuPdf(buffer) {
  const brut = Buffer.from(buffer).toString("latin1");
  const lignes = [];
  for (const m of brut.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let contenu;
    try {
      contenu = zlib.inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
    } catch {
      continue;
    }
    for (const ligne of contenu.split("\n")) {
      if (!ligne.endsWith("TJ")) continue;
      const morceaux = [...ligne.matchAll(/<([0-9a-f]+)>/gi)].map((x) => Buffer.from(x[1], "hex").toString("latin1"));
      lignes.push(morceaux.join(""));
    }
  }
  return lignes.join("\n");
}
