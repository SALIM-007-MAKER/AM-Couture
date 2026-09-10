/**
 * Aplati une ZodError en un objet de détails exploitable côté client.
 * `flatten().fieldErrors` seul perd les erreurs sans chemin de champ précis
 * (ex: .strict() sur une clé inconnue, .superRefine() au niveau de l'objet) —
 * on les regroupe sous la clé "_global" plutôt que de les faire disparaître.
 */
export function formatZodError(error) {
  const { fieldErrors, formErrors } = error.flatten();
  const details = { ...fieldErrors };
  if (formErrors.length > 0) {
    details._global = formErrors;
  }
  return details;
}
