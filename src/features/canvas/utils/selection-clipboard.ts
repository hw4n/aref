import { getAssetsBounds } from "@/domain/assets/asset-geometry";
import {
  isImageAsset,
  isTextAsset,
  type AssetItem,
  type ImageAssetItem,
  type TextAssetItem,
} from "@/domain/assets/types";
import {
  isLikelyFilePath,
  readManagedImageBytes,
  writeImageFilesToClipboard,
} from "@/features/project/persistence/project-io";
import { hasTauriRuntime } from "@/features/project/persistence/tauri-runtime";

const MAX_CLIPBOARD_CANVAS_EDGE = 16_384;

export type ClipboardCopyMode = "files" | "single-image" | "composite-image";

export interface ClipboardCopyResult {
  copiedCount: number;
  mode: ClipboardCopyMode;
}

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

async function copySingleAssetAsOriginalImage(asset: ImageAssetItem): Promise<ClipboardCopyResult> {
  const loaded = await loadCanvasImage(asset.imagePath);

  try {
    const canvasWidth = Math.max(1, Math.ceil(loaded.image.naturalWidth || loaded.image.width || asset.width));
    const canvasHeight = Math.max(1, Math.ceil(loaded.image.naturalHeight || loaded.image.height || asset.height));

    if (canvasWidth > MAX_CLIPBOARD_CANVAS_EDGE || canvasHeight > MAX_CLIPBOARD_CANVAS_EDGE) {
      throw new Error("Image is too large to copy at original resolution.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas rendering is not available.");
    }

    context.drawImage(loaded.image, 0, 0, canvasWidth, canvasHeight);
    await writePngBlobToClipboard(await canvasToPngBlob(canvas));

    return {
      copiedCount: 1,
      mode: "single-image",
    };
  } finally {
    loaded.revoke();
  }
}

async function copyAssetsAsNativeFiles(assets: AssetItem[]) {
  if (!hasTauriRuntime() || assets.length === 0) {
    return 0;
  }

  const fileAssets = assets.map((asset) => {
    if (!isImageAsset(asset) || !isLikelyFilePath(asset.imagePath)) {
      return null;
    }

    return {
      imagePath: asset.imagePath,
      sourceName: asset.sourceName,
    };
  });

  if (fileAssets.some((asset) => asset === null)) {
    return 0;
  }

  const clipboardFiles = fileAssets.flatMap((asset) => (asset ? [asset] : []));

  try {
    return await writeImageFilesToClipboard(clipboardFiles);
  } catch {
    return 0;
  }
}

function toCanvasFont(asset: TextAssetItem) {
  const fontSize = Math.max(1, asset.text.fontSize * asset.scale);
  const fontStyle = asset.text.fontStyle.includes("italic") ? "italic" : "normal";
  const fontWeight = asset.text.fontStyle.includes("bold") ? "700" : "400";

  return `${fontStyle} ${fontWeight} ${fontSize}px "${asset.text.fontFamily}"`;
}

function wrapTextLine(context: CanvasRenderingContext2D, line: string, maxWidth: number) {
  const words = line.split(/(\s+)/).filter((word) => word.length > 0);
  const wrapped: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = `${currentLine}${word}`;

    if (currentLine && context.measureText(nextLine).width > maxWidth) {
      wrapped.push(currentLine.trimEnd());
      currentLine = word.trimStart();
      continue;
    }

    currentLine = nextLine;
  }

  wrapped.push(currentLine.trimEnd());
  return wrapped.length > 0 ? wrapped : [""];
}

function drawTextAsset(context: CanvasRenderingContext2D, asset: TextAssetItem) {
  const width = asset.width * asset.scale;
  const height = asset.height * asset.scale;
  const fontSize = Math.max(1, asset.text.fontSize * asset.scale);
  const lineHeight = fontSize * asset.text.lineHeight;
  const padding = Math.max(0, fontSize * 0.02);

  context.save();
  context.beginPath();
  context.rect(-width / 2, -height / 2, width, height);
  context.clip();
  context.font = toCanvasFont(asset);
  context.fillStyle = asset.text.fill;
  context.textAlign = asset.text.align;
  context.textBaseline = "top";

  const textX = asset.text.align === "center"
    ? 0
    : asset.text.align === "right"
      ? width / 2 - padding
      : -width / 2 + padding;
  let textY = -height / 2;
  for (const paragraph of asset.text.value.split("\n")) {
    const lines = wrapTextLine(context, paragraph, width);

    for (const line of lines) {
      context.fillText(line, textX, textY);
      textY += lineHeight;

      if (textY > height / 2) {
        context.restore();
        return;
      }
    }
  }

  context.restore();
}

export async function copyAssetsToClipboard(assets: AssetItem[]): Promise<ClipboardCopyResult> {
  const visibleAssets = assets
    .filter((asset) => !asset.hidden)
    .sort((left, right) => left.zIndex - right.zIndex);
  const bounds = getAssetsBounds(visibleAssets);

  if (!bounds) {
    return {
      copiedCount: 0,
      mode: "composite-image",
    };
  }

  if (visibleAssets.length === 1 && isImageAsset(visibleAssets[0]!)) {
    return copySingleAssetAsOriginalImage(visibleAssets[0]!);
  }

  const nativeFileCount = await copyAssetsAsNativeFiles(visibleAssets);
  if (nativeFileCount > 0) {
    return {
      copiedCount: nativeFileCount,
      mode: "files",
    };
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
    asset: ImageAssetItem;
    image: HTMLImageElement;
    revoke: () => void;
  }> = [];

  try {
    for (const asset of visibleAssets) {
      if (!isImageAsset(asset)) {
        continue;
      }

      loadedImages.push({
        asset,
        ...(await loadCanvasImage(asset.imagePath)),
      });
    }

    for (const asset of visibleAssets) {
      const width = asset.width * asset.scale;
      const height = asset.height * asset.scale;

      context.save();
      context.translate(asset.x - bounds.x, asset.y - bounds.y);
      context.rotate((asset.rotation * Math.PI) / 180);
      if (isTextAsset(asset)) {
        drawTextAsset(context, asset);
      } else {
        const loaded = loadedImages.find((candidate) => candidate.asset.id === asset.id);

        if (loaded) {
          context.drawImage(loaded.image, -width / 2, -height / 2, width, height);
        }
      }
      context.restore();
    }

    await writePngBlobToClipboard(await canvasToPngBlob(canvas));
    return {
      copiedCount: visibleAssets.length,
      mode: visibleAssets.length === 1 ? "single-image" : "composite-image",
    };
  } finally {
    for (const loadedImage of loadedImages) {
      loadedImage.revoke();
    }
  }
}
