-- Rétro-remplissage du prix annuel des formules existantes (migration de DONNÉES, aucune structure modifiée).
--
-- Contexte : avant la tarification Niger, le prix d'une durée était CALCULÉ (lib/abonnement.js, ancienne règle) :
--     prix = prixMensuel × durée × (100 − remise) / 100
--   - `tarifsDuree` vide  → durées standard (1, 3, 6, 12 mois) SANS remise : le 12 mois était donc proposé ;
--   - `tarifsDuree` rempli → seules les durées listées étaient proposées, chacune avec sa `remisePourcent` ;
--     sans entrée « 12 », l'annuel n'était PAS proposé.
-- Depuis, le 12 mois n'est proposé que si `prixAnnuel` est renseigné (migration 20261204090000) : sans ce rétro-remplissage,
-- toutes les formules existantes perdraient leur offre annuelle sans aucun message. Cette migration recopie, une fois, le
-- prix que l'ancienne règle donnait EXACTEMENT. Le SuperAdmin peut ensuite le modifier librement.
--
-- Garanties :
--   - un `prixAnnuel` déjà renseigné n'est JAMAIS modifié (WHERE "prixAnnuel" IS NULL) ; relancer la migration ne change donc plus rien ;
--   - aucun prix n'est inventé : si le calcul est impossible ou ne donne pas un entier de 1 à 99 999 999 (le XOF n'a pas de
--     centimes, aucun arrondi n'est appliqué), la formule est LAISSÉE VIDE et listée par un NOTICE (journal du build) ;
--   - aucune autre colonne n'est touchée : `tarifsDuree` est conservé tel quel pour les contrats existants.
DO $$
DECLARE
  f record;
  entree jsonb;
  remise numeric;
  total numeric;
  remplies integer := 0;
  a_traiter integer := 0;
BEGIN
  FOR f IN
    SELECT id, nom, "prixMensuel" AS mensuel, "tarifsDuree" AS durees
    FROM "PlanAbonnement"
    WHERE "prixAnnuel" IS NULL
    ORDER BY nom
  LOOP
    remise := 0;

    IF f.mensuel IS NULL OR f.mensuel < 1 OR f.mensuel <> trunc(f.mensuel) THEN
      RAISE NOTICE '[retro-prix-annuel] « % » : prix mensuel absent, nul ou non entier (%) -> prix annuel à saisir par le SuperAdmin', f.nom, f.mensuel;
      a_traiter := a_traiter + 1;
      CONTINUE;
    END IF;

    IF f.durees IS NOT NULL AND jsonb_typeof(f.durees) = 'array' AND jsonb_array_length(f.durees) > 0 THEN
      -- Liste configurée : l'annuel n'existait que s'il y figurait une entrée « 12 ».
      SELECT e INTO entree
      FROM jsonb_array_elements(f.durees) AS e
      WHERE jsonb_typeof(e) = 'object' AND (e->>'dureeMois') ~ '^[0-9]+$' AND (e->>'dureeMois')::integer = 12
      LIMIT 1;

      IF entree IS NULL THEN
        RAISE NOTICE '[retro-prix-annuel] « % » : l''ancienne configuration ne proposait pas 12 mois -> aucun prix annuel créé', f.nom;
        CONTINUE;
      END IF;

      IF (entree->>'remisePourcent') IS NOT NULL AND (entree->>'remisePourcent') !~ '^[0-9]+(\.[0-9]+)?$' THEN
        RAISE NOTICE '[retro-prix-annuel] « % » : remise illisible (%) -> prix annuel à saisir par le SuperAdmin', f.nom, entree->>'remisePourcent';
        a_traiter := a_traiter + 1;
        CONTINUE;
      END IF;
      remise := COALESCE((entree->>'remisePourcent')::numeric, 0);
      IF remise < 0 OR remise > 90 THEN
        RAISE NOTICE '[retro-prix-annuel] « % » : remise hors limites (%) -> prix annuel à saisir par le SuperAdmin', f.nom, remise;
        a_traiter := a_traiter + 1;
        CONTINUE;
      END IF;
    END IF;

    total := f.mensuel * 12 * (100 - remise) / 100;
    IF total <> trunc(total) OR total < 1 OR total > 99999999 THEN
      RAISE NOTICE '[retro-prix-annuel] « % » : le calcul donne % (non entier ou hors limites) -> prix annuel à saisir par le SuperAdmin', f.nom, total;
      a_traiter := a_traiter + 1;
      CONTINUE;
    END IF;

    UPDATE "PlanAbonnement" SET "prixAnnuel" = total WHERE id = f.id AND "prixAnnuel" IS NULL;
    remplies := remplies + 1;
    RAISE NOTICE '[retro-prix-annuel] « % » : prix annuel = % (mensuel % x 12, remise % %%)', f.nom, total, f.mensuel, remise;
  END LOOP;

  RAISE NOTICE '[retro-prix-annuel] % formule(s) remplie(s), % formule(s) à traiter manuellement', remplies, a_traiter;
END
$$;
