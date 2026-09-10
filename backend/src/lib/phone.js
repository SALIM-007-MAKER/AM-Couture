/**
 * Normalise un numéro de téléphone pour un stockage et une comparaison
 * cohérents : conserve un "+" initial éventuel, retire tout le reste
 * (espaces, points, tirets, parenthèses...) pour ne garder que les chiffres.
 * "07 12 34 56 78" -> "0712345678" ; "+225 07 12 34 56 78" -> "+2250712345678"
 */
export function normalizePhone(raw) {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}
