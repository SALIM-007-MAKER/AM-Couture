import { useEffect } from "react";
import { CloudUpload } from "lucide-react";
import { useFileStore, chargerFile, abandonner, synchroniser } from "../lib/fileSynchro.js";
import { useConnexionStore } from "../lib/connexion.js";
import { peutConserver } from "../lib/instantane.js";
import { useMeQuery } from "../hooks/useAuth.js";
import { useTranslation } from "../i18n/index.js";

/**
 * Modifications faites hors connexion et pas encore envoyées (7.6). Visible tant qu'il en reste : l'utilisateur sait ce qui
 * attend, ce que le serveur a refusé (et pourquoi) et peut abandonner. Recharge la file de l'appareil au lancement.
 */
export default function FileEcrituresBanner() {
  const { t } = useTranslation();
  const { data: me } = useMeQuery();
  const elements = useFileStore((s) => s.elements);
  const enSynchro = useFileStore((s) => s.synchronisation);
  const horsLigne = useConnexionStore((s) => s.horsLigne);
  const userId = peutConserver(me) ? me.id : null;

  useEffect(() => {
    if (!userId) return;
    chargerFile(userId).then(() => synchroniser().catch(() => {}));
  }, [userId]);

  if (!userId || elements.length === 0) return null;
  const peutEnvoyer = !horsLigne && !enSynchro && elements.some((e) => e.etat === "attente");
  return (
    <div data-testid="file-ecritures" role="status" className="bg-sky-100 dark:bg-sky-950 text-sky-900 dark:text-sky-200 text-sm px-4 py-2 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <CloudUpload className="size-4 shrink-0" aria-hidden="true" />
        <strong>{t("file.titre", { count: elements.length })}</strong>
        {enSynchro && <span>{t("file.envoi")}</span>}
        {peutEnvoyer && (
          <button type="button" data-testid="file-envoyer" className="underline" onClick={() => synchroniser().catch(() => {})}>
            {t("file.envoyer")}
          </button>
        )}
      </div>
      <ul className="space-y-0.5">
        {elements.map((e) => (
          <li key={e.id} data-testid="file-element" data-etat={e.etat} className="flex flex-wrap items-baseline gap-x-2">
            <span>{e.libelle}</span>
            <span className="opacity-80">
              — {e.etat === "conflit" ? t("file.conflit") : e.etat === "a_verifier" ? t("file.aVerifier") : t("file.attente")}
              {e.message ? ` : ${e.message}` : ""}
            </span>
            <button type="button" className="underline" onClick={() => abandonner(e.id)}>
                {t("file.abandonner")}
              </button>
          </li>
        ))}
      </ul>
      <p className="opacity-80">{t("file.avertissement")}</p>
    </div>
  );
}
