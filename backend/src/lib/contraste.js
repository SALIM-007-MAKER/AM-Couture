// Contraste des couleurs (WCAG 2.x), pour que la couleur de marque d'un atelier ne rende jamais un texte illisible.
// Fonctions pures.

/** « #RRGGBB » → luminance relative (0 = noir, 1 = blanc), formule WCAG. */
export function luminance(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error("Couleur invalide.");
  const [r, g, b] = [m[1], m[2], m[3]].map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste entre deux couleurs (de 1 à 21). */
export function rapportContraste(a, b) {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (clair + 0.05) / (sombre + 0.05);
}

/** Seuil WCAG AA pour du texte normal. */
export const CONTRASTE_MINIMUM = 4.5;

/** La couleur porte-t-elle un texte BLANC de façon lisible (boutons, bandeaux de la vitrine) ? */
export const lisibleSurBlanc = (hex) => rapportContraste(hex, "#ffffff") >= CONTRASTE_MINIMUM;
