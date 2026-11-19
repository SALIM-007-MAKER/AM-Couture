-- Tarification Niger (XOF) : prix mensuel et annuel OPTIONNELS dans le catalogue des formules, devise et pays posés pour
-- l'extensibilité, devise figée sur les transactions, marqueur d'activation exceptionnelle.
-- Migration ADDITIVE : aucune colonne supprimée, aucune ligne modifiée, aucune formule ni donnée commerciale insérée.
--  - PlanAbonnement."prixMensuel" devient nullable (les prix existants sont conservés tels quels) ; "prixAnnuel" vide : le tarif
--    annuel n'est proposé que lorsque le SUPERADMIN le saisit. "tarifsDuree" est conservé (durées historiques des contrats
--    existants) mais n'alimente plus les offres.
--  - "pays" = 'NE' et "devise" = 'XOF' : constantes techniques, pas des données commerciales.
ALTER TABLE "PlanAbonnement" ALTER COLUMN "prixMensuel" DROP NOT NULL;
ALTER TABLE "PlanAbonnement" ADD COLUMN "prixAnnuel" DECIMAL(10,2);
ALTER TABLE "PlanAbonnement" ADD COLUMN "pays" TEXT NOT NULL DEFAULT 'NE';
ALTER TABLE "PlanAbonnement" ADD COLUMN "devise" TEXT NOT NULL DEFAULT 'XOF';
ALTER TABLE "PlanAbonnement" ADD CONSTRAINT "PlanAbonnement_prixAnnuel_positif_chk" CHECK ("prixAnnuel" IS NULL OR "prixAnnuel" > 0);
ALTER TABLE "Transaction" ADD COLUMN "devise" TEXT NOT NULL DEFAULT 'XOF';
ALTER TABLE "Abonnement" ADD COLUMN "tarifExceptionnel" BOOLEAN NOT NULL DEFAULT false;
