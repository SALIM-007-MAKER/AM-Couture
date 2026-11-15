// Statuts d'une commande encore « en production » (ni livrée, ni annulée) — miroir de backend/src/lib/production.js,
// vérifié par un test de dérive. Ne sert qu'à adapter l'interface : le serveur refuse de toute façon l'affectation.
export const STATUTS_OUVERTS = ["NOUVELLE", "EN_CONFECTION", "ESSAYAGE", "RETOUCHES", "TERMINEE"];
