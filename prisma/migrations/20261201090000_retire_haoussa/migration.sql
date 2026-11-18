-- Le haoussa n'est plus proposé (français et anglais seulement). Les comptes qui l'avaient choisi passent au français.
-- Retour arrière : non nécessaire au fonctionnement (le serveur retombe de toute façon sur le français pour une langue
-- inconnue) ; la liste des comptes concernés n'est pas conservée.
UPDATE "User" SET "langue" = 'fr' WHERE "langue" = 'ha';
