/** Construit une query string en ignorant les valeurs vides/undefined/null —
 * évite d'envoyer `?archived=undefined` ou `?q=` au backend. */
export function buildQuery(params = {}) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
