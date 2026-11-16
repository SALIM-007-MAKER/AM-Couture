import { useState } from "react";
import { useParams } from "react-router-dom";
import { MapPin, MessageCircle, Phone, Search, X, Scissors } from "lucide-react";
import { useVitrinePubliqueQuery } from "./hooks.js";
import DemandeForm from "./DemandeForm.jsx";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import { CATEGORIES_VETEMENT, categorieLabel } from "../modeles/constants.js";
import { ApiError } from "../../lib/apiClient.js";
import { useTranslation } from "../../i18n/index.js";

const COULEUR_PAR_DEFAUT = "#276386";
const chiffres = (tel) => (tel ?? "").replace(/\D/g, "");

/**
 * Vitrine PUBLIQUE d'un atelier (sans compte) : présentation, coordonnées si le PDG les montre, catalogue des modèles
 * publiés. Mobile d'abord. La couleur de marque (contraste déjà vérifié par le serveur) n'habille que les boutons et le
 * bandeau : le texte courant garde les couleurs de l'application.
 */
export default function VitrinePubliquePage() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const [q, setQ] = useState("");
  const [categorie, setCategorie] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [ouvert, setOuvert] = useState(null);
  const [demande, setDemande] = useState(null); // { modele } quand le formulaire de demande est ouvert
  const recherche = useDebouncedValue(q, 300);
  const { data, isPending, isError, error } = useVitrinePubliqueQuery(slug, { q: recherche, categorie, tag, page, pageSize: 24 });

  if (isError) {
    const absente = error instanceof ApiError && error.status === 404;
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-50 dark:bg-neutral-950 text-center">
        <div className="space-y-2">
          <Scissors className="size-8 mx-auto text-neutral-400" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100" data-testid="vitrine-introuvable">
            {absente ? t("vit.notFound") : t("vit.error")}
          </h1>
          <p className="text-sm text-neutral-500">{absente ? t("vit.notFoundHelp") : t("vit.errorHelp")}</p>
        </div>
      </main>
    );
  }
  if (isPending) {
    return (
      <main className="min-h-screen flex items-center justify-center text-neutral-500" role="status">
        {t("vit.loading")}
      </main>
    );
  }

  const { atelier, modeles, meta } = data;
  const couleur = atelier.couleur ?? COULEUR_PAR_DEFAUT;
  const whatsapp = atelier.contact?.telephone ? chiffres(atelier.contact.telephone) : "";
  const tags = [...new Set(modeles.flatMap((m) => m.tags))];
  const aDesCoordonnees = Boolean(atelier.contact && (atelier.contact.telephone || atelier.contact.adresse || atelier.contact.ville));

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100" style={{ "--marque": couleur }}>
      <header className="text-white" style={{ backgroundColor: couleur }}>
        <div className="max-w-5xl mx-auto px-4 py-8 flex items-center gap-4 flex-wrap">
          {atelier.logo && <img src={atelier.logo} alt="" className="size-16 rounded-xl bg-white object-contain p-1" />}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold" data-testid="vitrine-nom">{atelier.nom}</h1>
            {atelier.slogan && <p className="opacity-90">{atelier.slogan}</p>}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {(atelier.description || aDesCoordonnees) && (
          <section className="space-y-3">
            {atelier.description && <p className="whitespace-pre-wrap text-neutral-700 dark:text-neutral-300" data-testid="vitrine-description">{atelier.description}</p>}
            {aDesCoordonnees && (
              <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="vitrine-contact">
                {whatsapp && (
                  <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl px-4 py-2 font-medium text-white" style={{ backgroundColor: couleur }}>
                    <MessageCircle className="size-4" aria-hidden="true" />
                    {t("vit.whatsapp")}
                  </a>
                )}
                {atelier.contact.telephone && (
                  <a href={`tel:${atelier.contact.telephone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 underline">
                    <Phone className="size-4" aria-hidden="true" />
                    {atelier.contact.telephone}
                  </a>
                )}
                {(atelier.contact.adresse || atelier.contact.ville) && (
                  <span className="inline-flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                    <MapPin className="size-4" aria-hidden="true" />
                    {[atelier.contact.adresse, atelier.contact.ville, atelier.contact.pays].filter(Boolean).join(", ")}
                  </span>
                )}
              </div>
            )}
          </section>
        )}

        {atelier.demandes && (
          <button type="button" onClick={() => setDemande({ modele: null })} className="rounded-xl px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: couleur }} data-testid="demande-generale">
            {t("dvit.askGeneral")}
          </button>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("vit.catalogue")}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" aria-hidden="true" />
              <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t("vit.search")} aria-label={t("vit.search")} className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 pl-9 pr-3 py-2 text-sm" />
            </div>
            <select value={categorie} onChange={(e) => { setCategorie(e.target.value); setPage(1); }} aria-label={t("vit.category")} className="rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm">
              <option value="">{t("vit.allCategories")}</option>
              {CATEGORIES_VETEMENT.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5" data-testid="vitrine-tags">
              {tags.map((x) => (
                <button key={x} type="button" onClick={() => { setTag(tag === x ? "" : x); setPage(1); }} className={`rounded-full border px-2.5 py-0.5 text-xs ${tag === x ? "text-white" : "bg-white dark:bg-neutral-900"}`} style={tag === x ? { backgroundColor: couleur, borderColor: couleur } : undefined} aria-pressed={tag === x}>
                  {x}
                </button>
              ))}
            </div>
          )}

          {modeles.length === 0 ? (
            <p className="text-sm text-neutral-500 py-8 text-center" data-testid="vitrine-vide">{t("vit.empty")}</p>
          ) : (
            <ul className="grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="vitrine-catalogue">
              {modeles.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => setOuvert(m)} className="w-full text-left rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:shadow-md transition-shadow" data-testid={`modele-${m.nom}`}>
                    {m.photos[0] ? (
                      <img src={m.photos[0].url} alt={m.photos[0].legende || m.nom} loading="lazy" className="aspect-[3/4] w-full object-cover" />
                    ) : (
                      <div className="aspect-[3/4] w-full bg-neutral-100 dark:bg-neutral-800" />
                    )}
                    <div className="p-2.5">
                      <p className="font-medium text-sm">{m.nom}</p>
                      <p className="text-xs text-neutral-500">{categorieLabel(m.categorie)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">{t("vit.prev")}</button>
              <span>{page} / {meta.totalPages}</span>
              <button type="button" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">{t("vit.next")}</button>
            </div>
          )}
        </section>
      </div>

      {ouvert && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={ouvert.nom} onClick={() => setOuvert(null)}>
          <div className="bg-white dark:bg-neutral-900 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()} data-testid="vitrine-detail">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{ouvert.nom}</h3>
                <p className="text-xs text-neutral-500">{categorieLabel(ouvert.categorie)}</p>
              </div>
              <button type="button" onClick={() => setOuvert(null)} aria-label={t("vit.close")} className="p-1"><X className="size-5" /></button>
            </div>
            {ouvert.photos.map((p) => (
              <img key={p.url} src={p.url} alt={p.legende || ouvert.nom} loading="lazy" className="w-full rounded-xl" />
            ))}
            {ouvert.description && <p className="text-sm whitespace-pre-wrap">{ouvert.description}</p>}
            {ouvert.tags.length > 0 && <p className="text-xs text-neutral-500">{ouvert.tags.join(" · ")}</p>}
            {atelier.demandes && (
              <button type="button" onClick={() => { setDemande({ modele: ouvert }); setOuvert(null); }} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white mr-2" style={{ backgroundColor: couleur }} data-testid="demander-modele">
                {t("dvit.askModel")}
              </button>
            )}
            {whatsapp && (
              <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(t("vit.whatsappAsk", { modele: ouvert.nom }))}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: couleur }}>
                <MessageCircle className="size-4" aria-hidden="true" />
                {t("vit.askModel")}
              </a>
            )}
          </div>
        </div>
      )}
      {demande && <DemandeForm slug={slug} modele={demande.modele} couleur={couleur} onClose={() => setDemande(null)} />}
    </main>
  );
}
