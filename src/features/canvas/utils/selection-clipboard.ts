import { getAssetsBounds } from "@/domain/assets/asset-geometry";
import type { AssetItem } from "@/domain/assets/types";
import { isLikelyFilePath, readManagedImageBytes } from "@/features/project/persistence/project-io";
import { hasTauriRuntime } from "@/features/project/persistence/tauri-runtime";

const MAX_CLIPBOARD_CANVAS_EDGE = 16_384;

function inferMimeTypeFromSource(source: string) {
  const extension = source.split(/[\\/]/).at(-1)?.split(".").at(-1)?.toLowerCase();

  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  if (extension === "svg") {
    return "image/svg+xml";
  }

  return "image/png";
}

async function resolveImageUrl(source: string) {
  if (hasTauriRuntime() && isLikelyFilePath(source)) {
    const bytes = await readManagedImageBytes(source);
    const objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], {
      type: inferMimeTypeFromSource(source),
    }));

    return {
      url: objectUrl,
      revoke: () => URL.revokeObjectURL(objectUrl),
    };
  }

  return {
    url: source,
    revoke: () => {},
  };
}

async function loadCanvasImage(source: string) {
  const resolved = await resolveImageUrl(source);

  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load image for clipboard copy: ${source}`));
    });

    image.src = resolved.url;
    return {
      image: await loaded,
      revoke: resolved.revoke,
    };
  } catch (error) {
    resolved.revoke();
    throw error;
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode clipboard image."));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

async function writePngBlobToClipboard(blob: Blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("This browser does not support writing images to the clipboard.");
  }

  await navigator.clipboard.write([
    new ClipboardItem({
      "image/png": blob,
    }),
  ]);
}

export async function copyAssetsToClipboard(assets: AssetItem[]) {
  const visibleAssets = assets
    .filter((asset) => !asset.hidden)
    .sort((left, right) => left.zIndex - right.zIndex);
  const bounds = getAssetsBounds(visibleAssets);

  if (!bounds) {
    return 0;
  }

  const canvasWidth = Math.max(1, Math.ceil(bounds.width));
  const canvasHeight = Math.max(1, Math.ceil(bounds.height));

  if (canvasWidth > MAX_CLIPBOARD_CANVAS_EDGE || canvasHeight > MAX_CLIPBOARD_CANVAS_EDGE) {
    throw new Error("Selection is too large to copy as a single image.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas rendering is not available.");
  }

  const loadedImages: Array<{
    asset: AssetItem;
    image: HTMLImageElement;
    revoke: () => void;
  }> = [];

  try {
    for (const asset of visibleAssets) {
      loadedImages.push({
        asset,
        ...(await loadCanvasImage(asset.imagePath)),
      });
    }

    for (const { asset, image } of loadedImages) {
      const width = asset.width * asset.scale;
      const height = asset.height * asset.scale;

      context.save();
      context.translate(asset.x - bounds.x, asset.y - bounds.y);
      context.rotate((asset.rotation * Math.PI) / 180);
      context.drawImage(image, -width / 2, -height / 2, width, height);
      context.restore();
    }

    await writePngBlobToClipboard(await canvasToPngBlob(canvas));
    return visibleAssets.length;
  } finally {
    for (const loadedImage of loadedImages) {
      loadedImage.revoke();
    }
  }
}
