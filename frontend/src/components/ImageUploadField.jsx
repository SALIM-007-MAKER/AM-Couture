import { useRef, useState } from "react";
import { Image as ImageIcon, Upload, X } from "lucide-react";
import { fileToResizedDataUrl } from "../lib/imageFile.js";
import Button from "./Button.jsx";

/**
 * Champ photo par upload (galerie/appareil) — remplace un champ URL texte.
 * La valeur est un data URL base64 stocké tel quel dans le champ existant
 * (photoUrl, logoUrl) : redimensionnement + compression faits ici, avant
 * envoi (voir lib/imageFile.js). Aucun service de stockage externe.
 */
export default function ImageUploadField({
  value,
  onChange,
  maxDimension,
  maxBytes,
  targetBytes,
  previewClassName = "size-24 object-cover",
  alt = "Aperçu",
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de re-choisir le même fichier juste après
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file, { maxDimension, maxBytes, targetBytes });
      onChange(dataUrl);
    } catch (err) {
      setError(err.message || "Impossible de traiter cette image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <div className="flex items-center gap-3">
        {value ? (
          <img
            src={value}
            alt={alt}
            className={`rounded-lg border border-neutral-200 dark:border-neutral-800 ${previewClassName}`}
          />
        ) : (
          <div
            className={`flex items-center justify-center rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-400 ${previewClassName}`}
          >
            <ImageIcon className="size-6" aria-hidden="true" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Button type="button" variant="secondary" size="sm" icon={Upload} loading={busy} onClick={() => inputRef.current?.click()}>
            {value ? "Changer" : "Choisir une image"}
          </Button>
          {value && !busy && (
            <Button type="button" variant="danger-ghost" size="sm" icon={X} onClick={() => onChange("")}>
              Retirer
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
