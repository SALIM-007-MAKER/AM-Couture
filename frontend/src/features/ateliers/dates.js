import { useLocaleStore } from "../../stores/localeStore.js";

export function formatDateAbonnement(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(useLocaleStore.getState().locale === "en" ? "en-GB" : "fr-FR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
