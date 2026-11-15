import { ApiError } from "./apiError.js";

/**
 * Message à montrer à l'utilisateur pour une erreur quelconque, et référence à lui faire
 * communiquer au support.
 *
 * - Erreur métier / validation (4xx) : le message du serveur, tel quel (il est déjà choisi et sûr).
 * - Panne (réseau, délai, 5xx, 413) : un message traduit dans la langue de l'interface — le serveur
 *   ne renvoie qu'une phrase générique en français, inutilisable en anglais.
 * - `reference` : seulement pour les erreurs serveur (5xx), sinon null. Elle retrouve la ligne de
 *   journal exacte (voir docs/JOURNALISATION.md).
 *
 * `t` est la fonction de traduction (useTranslation().t ou translate).
 */
export function messageUtilisateur(error, t) {
  if (!(error instanceof ApiError)) return { message: t("ui.errorGeneric"), reference: null };
  switch (error.kind) {
    case "network":
      return { message: t("ui.errorNetwork"), reference: null };
    case "timeout":
      return { message: t("ui.errorTimeout"), reference: null };
    case "unavailable":
      return { message: t("ui.errorUnavailable"), reference: error.requestId };
    case "tooLarge":
      return { message: t("ui.errorTooLarge"), reference: null };
    case "server":
      return { message: t("ui.errorServer"), reference: error.requestId };
    default:
      return { message: error.message, reference: null };
  }
}

/**
 * Vrai si `details` contient au moins une erreur de champ (valeur = liste de messages, voir formatZodError
 * côté backend). Faux pour une erreur métier dont `details` décrit autre chose (ex. 409 « téléphone déjà
 * utilisé » : identité de la cliente existante) — le message général doit alors être affiché, faute de champ
 * où montrer une erreur.
 */
export function aDesErreursDeChamps(details) {
  return !!details && typeof details === "object" && Object.values(details).some((v) => Array.isArray(v));
}
