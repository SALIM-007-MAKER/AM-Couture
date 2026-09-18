import { MESURE_FIELDS, MESURE_GROUPS, formatDate } from "../constants.js";
import { useTranslation } from "../../../i18n/index.js";
import Card from "../../../components/Card.jsx";
import Disclosure from "../../../components/Disclosure.jsx";

const FIELD_BY_NAME = Object.fromEntries(MESURE_FIELDS.map((f) => [f.name, f]));

/**
 * Une prise de mesure — extrait de MesuresHistory.jsx (côté ADMIN) pour être
 * réutilisé tel quel côté client final (§ plan rôle USER, Phase 3, voir
 * features/moi/ClientMesuresPage.jsx) : même rendu, mêmes deux publics.
 */
export default function MesureCard({ mesure }) {
  const { t } = useTranslation();
  const populatedCount = MESURE_FIELDS.filter((f) => mesure[f.name] != null).length;
  return (
    <Card variant="outlined">
      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{formatDate(mesure.createdAt)}</p>
      {populatedCount > 0 ? (
        <div className="mt-2 space-y-2">
          {MESURE_GROUPS.map((group) => {
            const populated = group.fields.map((name) => FIELD_BY_NAME[name]).filter((f) => mesure[f.name] != null);
            if (populated.length === 0) return null;
            return (
              <Disclosure key={group.key} label={group.label} badge={`${populated.length}`} defaultOpen>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm">
                  {populated.map((f) => (
                    <div key={f.name} className="flex justify-between gap-2">
                      <dt className="text-neutral-500">{f.label}</dt>
                      <dd className="text-neutral-900 dark:text-neutral-100">{mesure[f.name]} cm</dd>
                    </div>
                  ))}
                </dl>
              </Disclosure>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-neutral-500 mt-1">{t("mesure.card.noStructured")}</p>
      )}
      {mesure.autres && Object.keys(mesure.autres).length > 0 && (
        <dl className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm">
          {Object.entries(mesure.autres).map(([label, value]) => (
            <div key={label} className="flex justify-between gap-2">
              <dt className="text-neutral-500">{label}</dt>
              <dd className="text-neutral-900 dark:text-neutral-100">{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {mesure.notes && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{mesure.notes}</p>}
    </Card>
  );
}
