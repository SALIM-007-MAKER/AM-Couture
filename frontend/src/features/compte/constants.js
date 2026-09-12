// Doit rester synchronisé avec LANGUES_DISPONIBLES (backend/src/schemas/compte.schema.js).
// Préférence stockée UNIQUEMENT (Phase 6) : sélectionner une langue autre que
// "fr" n'a aucun effet sur l'interface pour l'instant (aucune traduction —
// voir note affichée dans ComptePage.jsx).
export const LANGUES_DISPONIBLES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "ha", label: "Hausa" },
];
