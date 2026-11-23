import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ArrowRight } from "lucide-react";
import { useMeQuery } from "../../hooks/useAuth.js";
import { useTranslation } from "../../i18n/index.js";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import { guideDe, sectionsVisibles, decouper, chargerTextes, lienEtape, urlCapture } from "./guide.js";

// Page « Guide d'utilisation » : la même page sert les quatre espaces (atelier, client, plateforme). Le guide affiché dépend
// UNIQUEMENT du rôle du compte connecté (guideDe) ; les sections et étapes d'un employé suivent ses permissions (sectionsVisibles).
// Le texte de chaque guide est chargé à la demande : un compte ne télécharge que le sien.

/** Texte d'une étape : chaque [[cle.i18n]] devient le libellé réel de l'interface, dans la langue affichée. */
function Texte({ valeur }) {
  const { t } = useTranslation();
  return decouper(valeur).map((m, i) =>
    m.ui ? (
      <strong key={i} className="font-semibold text-neutral-900 dark:text-neutral-100">
        «&nbsp;{t(m.ui)}&nbsp;»
      </strong>
    ) : (
      <span key={i}>{m.texte}</span>
    ),
  );
}

function Capture({ idCapture, titre }) {
  const { t, locale } = useTranslation();
  const [manquante, setManquante] = useState(false);
  if (manquante) return null;
  return (
    <figure className="space-y-1.5">
      <picture>
        <source media="(max-width: 639px)" srcSet={urlCapture(locale, idCapture, "mobile")} />
        <img
          src={urlCapture(locale, idCapture, "desktop")}
          alt={t("guide.screenshotAlt", { titre })}
          loading="lazy"
          onError={() => setManquante(true)}
          className="w-full max-w-3xl h-auto rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white"
        />
      </picture>
      <figcaption className="text-xs text-neutral-500">{t("guide.screenshotNote")}</figcaption>
    </figure>
  );
}

function Section({ guide, user, section, texte, index }) {
  const { t } = useTranslation();
  return (
    <section id={`guide-${section.id}`} data-section={section.id} className="scroll-mt-20 space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          {index + 1}. {texte.title}
        </h2>
        {texte.intro && <p className="text-sm text-neutral-600 dark:text-neutral-400">{texte.intro}</p>}
      </div>
      {section.shot && section.captureVisible && <Capture idCapture={section.shot.id} titre={texte.title} />}
      <ol className="space-y-4">
        {section.steps.map((etape) => {
          const contenu = texte.steps[etape.id];
          const lien = lienEtape(guide, user, etape.to);
          return (
            <li key={etape.id} data-etape={etape.id} className="flex gap-3">
              <span
                className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white"
                aria-label={t("guide.step", { numero: etape.numero })}
              >
                {etape.numero}
              </span>
              <div className="min-w-0 space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
                <p>
                  <Texte valeur={contenu.text} />
                </p>
                {contenu.result && (
                  <p className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-emerald-900 dark:text-emerald-200">
                    <span className="font-semibold">{t("guide.expected")} : </span>
                    <Texte valeur={contenu.result} />
                  </p>
                )}
                {lien && (
                  <Link to={lien} className="inline-flex items-center gap-1 text-brand-700 dark:text-brand-400 hover:underline">
                    {t("guide.openScreen")} <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default function GuidePage() {
  const { t, locale } = useTranslation();
  const { data: user, isPending: userPending } = useMeQuery();
  const guide = guideDe(user);
  const textes = useQuery({
    queryKey: ["guide", guide, locale],
    queryFn: () => chargerTextes(guide, locale),
    enabled: Boolean(guide),
    staleTime: Infinity,
  });
  const sections = useMemo(() => (guide ? sectionsVisibles(guide, user) : []), [guide, user]);

  if (userPending) return <LoadingState label={t("guide.loading")} />;
  if (!guide) return <EmptyState icon={BookOpen}>{t("guide.unavailable")}</EmptyState>;
  if (textes.isPending) return <LoadingState label={t("guide.loading")} />;
  if (textes.isError) return <ErrorState error={textes.error} onRetry={textes.refetch} />;

  const contenu = textes.data;
  const sommaire = (
    <ul className="space-y-1 text-sm">
      {sections.map((s, i) => (
        <li key={s.id}>
          <a href={`#guide-${s.id}`} className="block rounded-md px-2 py-1 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            {i + 1}. {contenu.sections[s.id].title}
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      <PageHeader icon={BookOpen} title={contenu.title} subtitle={contenu.subtitle} />
      <p className="max-w-3xl text-sm text-neutral-600 dark:text-neutral-400">{contenu.intro}</p>
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        <aside className="mb-6 lg:mb-0">
          <details className="lg:hidden rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
            <summary className="cursor-pointer text-sm font-medium">{t("guide.toc")}</summary>
            <div className="mt-2">{sommaire}</div>
          </details>
          <nav aria-label={t("guide.toc")} className="hidden lg:block sticky top-6">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{t("guide.toc")}</p>
            {sommaire}
          </nav>
        </aside>
        <Card className="min-w-0 max-w-3xl space-y-10 p-4 sm:p-6" padded={false}>
          {sections.map((section, i) => (
            <Section key={section.id} guide={guide} user={user} section={section} texte={contenu.sections[section.id]} index={i} />
          ))}
        </Card>
      </div>
    </div>
  );
}
