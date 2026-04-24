const THUMBNAIL_MAX_DIMENSION = 256;
const THUMBNAIL_MIME_TYPE = "image/png";

export function getThumbnailFileName(sourceName: string | undefined) {
  const fallbackName = "image";
  const fileName = sourceName?.split(/[\\/]/).filter(Boolean).at(-1) ?? fallbackName;
  const stem = fileName.includes(".") ? fileName.split(".").slice(0, -1).join(".") : fileName;
  return `${stem || fallbackName}-thumbnail.png`;
}

export function loadImageElement(source: string, sourceName = "image") {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();

    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image file: ${sourceName}`));
    image.src = source;
  });
}

function getImageDimensions(image: HTMLImageElement) {
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, THUMBNAIL_MIME_TYPE);
  });
}

export async function createImageThumbnailBlob(image: HTMLImageElement) {
  try {
    const dimensions = getImageDimensions(image);
    const maxDimension = Math.max(dimensions.width, dimensions.height, 1);
    const scale = Math.min(1, THUMBNAIL_MAX_DIMENSION / maxDimension);
    const width = Math.max(1, Math.round(dimensions.width * scale));
    const height = Math.max(1, Math.round(dimensions.height * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    canvas.width = width;
    canvas.height = height;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    return await canvasToBlob(canvas);
  } catch {
    return null;
  }
}
