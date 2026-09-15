// Génération de CSV pour les exports (Clientes, Commandes, Dépenses...).
//
// Délimiteur POINT-VIRGULE (;), pas la virgule du standard RFC 4180: Excel
// en localisation française (celle attendue ici — l'app est entièrement en
// français, utilisée en Afrique de l'Ouest francophone) utilise la virgule
// comme séparateur décimal, et attend donc ";" pour scinder les colonnes
// automatiquement à l'ouverture du fichier — sans ça, tout atterrit dans une
// seule colonne et l'utilisateur doit manuellement "Convertir en colonnes".
//
// BOM UTF-8 en tête : sans lui, Excel Windows ouvre le fichier en ANSI/Latin-1
// par défaut et affiche mal les caractères accentués (é, è, à...).
const DELIMITEUR = ";";
const BOM = "﻿";

function echapperChamp(valeur) {
  if (valeur === null || valeur === undefined) return "";
  const str = String(valeur);
  if (str.includes(DELIMITEUR) || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Construit le contenu d'un fichier CSV à partir de lignes d'objets et
 * d'une liste de colonnes `{ header, accessor }` — `accessor` est soit une
 * clé de l'objet, soit une fonction `(row) => valeur` pour une valeur
 * dérivée (ex: date formatée, calcul simple).
 */
export function buildCsv(rows, colonnes) {
  const entete = colonnes.map((c) => echapperChamp(c.header)).join(DELIMITEUR);
  const lignes = rows.map((row) =>
    colonnes
      .map((c) => echapperChamp(typeof c.accessor === "function" ? c.accessor(row) : row[c.accessor]))
      .join(DELIMITEUR),
  );
  // \r\n : fin de ligne attendue par Excel Windows, même si le fichier est
  // généré sur un serveur Linux (Vercel) — CSV n'hérite pas de la
  // convention du système qui le produit.
  return BOM + [entete, ...lignes].join("\r\n") + "\r\n";
}

/** Pose les en-têtes HTTP standard pour un téléchargement de fichier CSV. */
export function envoyerCsv(res, nomFichier, csv) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nomFichier}"`);
  res.send(csv);
}
