// Conversion d'un fichier image (galerie/appareil photo) en data URL base64,
// redimensionné et compressé côté client avant envoi au backend — l'image
// est stockée telle quelle dans le champ texte existant (photoUrl, logoUrl),
// voir optionalImageField (backend/src/lib/zodHelpers.js). Aucun service de
// stockage externe : décision produit pour rester identique en local et sur
// Vercel sans configuration supplémentaire.
//
// Cibles de taille volontairement basses (voir targetBytes) : la base Neon
// distante répond vite pour un enregistrement classique (~2-3s, latence
// réseau normale), mais écrire une valeur texte de plusieurs centaines de Ko
// à quelques Mo dans cette même colonne fait grimper le temps de requête de
// façon très marquée (mesuré : ~3s pour 100 Ko, ~10s pour 1 Mo, ~13-24s pour
// 1,5 Mo, en écriture directe comme via l'API) — sans doute la fenêtre TCP
// qui redémarre à froid sur une connexion Neon peu utilisée. Viser une image
// finale petite garde "Enregistrer" rapide ; maxBytes reste un garde-fou dur
// aligné sur la limite serveur, pas un objectif.

async function loadImage(file) {
  if (typeof window !== "undefined" && window.createImageBitmap) {
    try {
      return await createImageBitmap(file);
    } catch {
      // certains formats/navigateurs échouent avec createImageBitmap ; on
      // retombe sur <img> ci-dessous plutôt que d'abandonner.
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de lire cette image."));
    };
    img.src = url;
  });
}

function dataUrlByteSize(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = (base64.match(/=*$/) || [""])[0].length;
  return Math.ceil((base64.length * 3) / 4 - padding);
}

function renderCanvas(source, width, height, whiteBackground) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (whiteBackground) {
    // JPEG ne supporte pas la transparence : sans ce fond, une zone
    // transparente de la source serait rendue en noir.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/**
 * Redimensionne et compresse un fichier image, puis renvoie un data URL
 * base64 prêt à être stocké tel quel (photoUrl / logoUrl). L'image source
 * n'est décodée qu'une fois ; plusieurs ré-encodages (qualité décroissante,
 * puis bascule PNG → JPEG si besoin) sont ensuite essayés en mémoire pour
 * viser `targetBytes`. `maxBytes` est le seul refus ferme (aligné sur la
 * limite acceptée par le backend) — au-delà de `targetBytes` mais en dessous
 * de `maxBytes`, le meilleur résultat obtenu est accepté tel quel plutôt que
 * de dégrader indéfiniment la qualité.
 */
export async function fileToResizedDataUrl(file, { maxDimension = 640, maxBytes = 2 * 1024 * 1024, targetBytes = 200 * 1024 } = {}) {
  if (!file.type || !file.type.startsWith("image/")) {
    throw new Error("Le fichier choisi n'est pas une image.");
  }

  const source = await loadImage(file);
  const width = source.width;
  const height = source.height;
  if (!width || !height) {
    throw new Error("Impossible de lire cette image.");
  }

  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  // PNG (transparence) préservé tant que le résultat reste raisonnable ;
  // au-delà, on bascule en JPEG (fond blanc) — une photo de vêtement n'a
  // normalement pas besoin de transparence, et JPEG compresse bien mieux.
  let preferPng = file.type === "image/png";
  let quality = 0.75;
  let lastDataUrl = null;
  let lastBytes = Infinity;

  for (let attempt = 0; attempt < 8; attempt++) {
    const outputType = preferPng ? "image/png" : "image/jpeg";
    const canvas = renderCanvas(source, targetWidth, targetHeight, !preferPng);
    const dataUrl = canvas.toDataURL(outputType, quality);
    const bytes = dataUrlByteSize(dataUrl);
    lastDataUrl = dataUrl;
    lastBytes = bytes;

    if (bytes <= targetBytes) return dataUrl;
    if (preferPng) {
      preferPng = false; // PNG encore trop lourd : on retente directement en JPEG
      continue;
    }
    if (quality > 0.4) {
      quality -= 0.12;
      continue;
    }
    break; // qualité minimale atteinte : on garde le meilleur résultat obtenu
  }

  if (lastBytes > maxBytes) {
    throw new Error(
      `Image trop volumineuse même après compression (max ${(maxBytes / (1024 * 1024)).toFixed(1)} Mo). Essayez une photo plus légère.`,
    );
  }
  return lastDataUrl;
}
