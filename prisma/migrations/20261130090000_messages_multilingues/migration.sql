-- 7.7 — le fil d'activité des clientes enregistre un code et des paramètres (message composé à la lecture, dans la langue
-- de la cliente). Additif : les lignes existantes gardent leur texte, code et params restent NULL.
ALTER TABLE "NotificationClient" ADD COLUMN "code" TEXT;
ALTER TABLE "NotificationClient" ADD COLUMN "params" JSONB;
