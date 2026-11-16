import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, ImagePlus, Tag, Trash2 } from "lucide-react";
import { useAjouterPhotoMutation, useSupprimerPhotoMutation, useOrdrePhotosMutation, usePublierModeleMutation } from "../lookbookHooks.js";
import { fileToResizedDataUrl } from "../../../lib/imageFile.js";
import { useCan } from "../../../hooks/usePermissions.js";
import { useTranslation } from "../../../i18n/index.js";
import { GlobalFormError } from "../../../components/QueryState.jsx";
import Card from "../../../components/Card.jsx";
import Button from "../../../components/Button.jsx";
import SectionTitle from "../../../components/SectionTitle.jsx";
import { inputClass } from "../../../components/FormField.jsx";

const MAX_PHOTOS = 8; // miroir de MAX_PHOTOS_MODELE (backend/src/schemas/modele.schema.js) ; le serveur reste juge
const analyserTags = (texte) => texte.split(",").map((t) => t.trim()).filter(Boolean);

/** Lookbook d'un modèle : galerie de photos (la première est la couverture), publication et tags. */
export default function LookbookSection({ modele }) {
  const { t } = useTranslation();
  const can = useCan();
  const ecriture = can("modeles.ecrire") && !modele.archivedAt;
  const photos = modele.photos ?? [];
  const fichier = useRef(null);
  const [erreurImage, setErreurImage] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [tags, setTags] = useState(() => (modele.tags ?? []).join(", "));
  const ajouter = useAjouterPhotoMutation(modele.id);
  const supprimer = useSupprimerPhotoMutation(modele.id);
  const ordre = useOrdrePhotosMutation(modele.id);
  const publier = usePublierModeleMutation(modele.id);

  async function choisir(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErreurImage("");
    setOccupe(true);
    try {
      // Plus grande que la miniature de la fiche : c'est la photo que la cliente verra (le serveur plafonne à 2 Mo).
      const image = await fileToResizedDataUrl(f, { maxDimension: 1280, targetBytes: 400 * 1024 });
      await ajouter.mutateAsync({ image });
    } catch (err) {
      setErreurImage(err.message || t("ui.imageProcessError"));
    } finally {
      setOccupe(false);
    }
  }

  function deplacer(i, delta) {
    const ids = photos.map((p) => p.id);
    [ids[i], ids[i + delta]] = [ids[i + delta], ids[i]];
    ordre.mutate(ids);
  }

  const erreurs = ajouter.error || supprimer.error || ordre.error || publier.error;

  return (
    <section className="space-y-2" data-testid="lookbook">
      <SectionTitle icon={ImagePlus}>{t("look.title")}</SectionTitle>
      <Card className="space-y-4 text-sm">
        <GlobalFormError error={erreurs} />
        {erreurImage && <p className="text-xs text-red-600 dark:text-red-400">{erreurImage}</p>}

        {photos.length === 0 ? (
          <p className="text-neutral-500">{t("look.empty")}</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="galerie">
            {photos.map((p, i) => (
              <li key={p.id} className="space-y-1.5" data-testid={`photo-${i}`}>
                <img src={p.url} alt={p.legende || modele.nom} loading="lazy" className="aspect-[3/4] w-full object-cover rounded-lg border border-neutral-200 dark:border-neutral-800" />
                {i === 0 && <p className="text-[11px] text-neutral-500">{t("look.cover")}</p>}
                {ecriture && (
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" icon={ArrowLeft} disabled={i === 0 || ordre.isPending} onClick={() => deplacer(i, -1)} aria-label={t("look.moveLeft")} />
                    <Button type="button" variant="ghost" size="sm" icon={ArrowRight} disabled={i === photos.length - 1 || ordre.isPending} onClick={() => deplacer(i, 1)} aria-label={t("look.moveRight")} />
                    <Button type="button" variant="danger-ghost" size="sm" icon={Trash2} loading={supprimer.isPending && supprimer.variables === p.id} onClick={() => supprimer.mutate(p.id)} aria-label={t("look.remove")} data-testid={`supprimer-photo-${i}`} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {ecriture && (
          <div className="space-y-3">
            <input ref={fichier} type="file" accept="image/*" className="hidden" onChange={choisir} data-testid="fichier-photo" />
            <Button type="button" variant="secondary" size="sm" icon={ImagePlus} loading={occupe} disabled={photos.length >= MAX_PHOTOS} onClick={() => fichier.current?.click()} data-testid="ajouter-photo">
              {t("look.add")}
            </Button>
            <p className="text-xs text-neutral-500">{t("look.limit", { max: MAX_PHOTOS })}</p>

            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="size-4 text-neutral-400" aria-hidden="true" />
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("look.tagsPlaceholder")} aria-label={t("look.tags")} className={`${inputClass} flex-1 min-w-[200px]`} maxLength={400} data-testid="tags" />
              <Button type="button" variant="secondary" size="sm" loading={publier.isPending} onClick={() => publier.mutate({ tags: analyserTags(tags) })} data-testid="enregistrer-tags">
                {t("look.saveTags")}
              </Button>
            </div>

            <div className="flex items-center gap-3 flex-wrap border-t border-neutral-100 dark:border-neutral-800 pt-3">
              <Button
                type="button"
                variant={modele.publie ? "secondary" : "primary"}
                size="sm"
                icon={modele.publie ? EyeOff : Eye}
                loading={publier.isPending}
                disabled={!modele.publie && photos.length === 0 && !modele.photoUrl}
                onClick={() => publier.mutate({ publie: !modele.publie })}
                data-testid="basculer-publication"
              >
                {modele.publie ? t("look.unpublish") : t("look.publish")}
              </Button>
              <span className="text-xs text-neutral-500" data-testid="etat-publication">
                {modele.publie ? t("look.published") : t("look.notPublished")}
              </span>
            </div>
          </div>
        )}

        {!ecriture && (modele.tags ?? []).length > 0 && <p className="text-neutral-600 dark:text-neutral-400">{modele.tags.join(" · ")}</p>}
      </Card>
    </section>
  );
}
