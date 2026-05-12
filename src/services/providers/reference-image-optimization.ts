export interface ReferenceImagePayload {
  filename: string;
  mimeType: string;
  bytes: number[];
  originalByteLength?: number;
}

const MIN_BYTES_FOR_REFERENCE_COMPRESSION = 768 * 1024;
const TARGET_REFERENCE_BYTES = 1_250_000;
const MAX_REFERENCE_DIMENSION = 1600;
const JPEG_QUALITY_STEPS = [0.82, 0.74, 0.66, 0.58, 0.5];

function canCompressReferences() {
  return typeof document !== "undefined" && typeof Blob !== "undefined" && typeof URL !== "undefined";
}

function replaceExtension(filename: string, extension: string) {
  const trimmed = filename.trim();
  const withoutExtension = trimmed.replace(/\.[A-Za-z0-9]+$/, "");
  return `${withoutExtension || "reference"}.${extension}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function decodeImage(blob: Blob) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (context: CanvasRenderingContext2D, width: number, height: number) => {
        context.drawImage(bitmap, 0, 0, width, height);
      },
      close: () => bitmap.close(),
    };
  }

  return new Promise<{
    width: number;
    height: number;
    draw: (context: CanvasRenderingContext2D, width: number, height: number) => void;
    close: () => void;
  }>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        draw: (context, width, height) => {
          context.drawImage(image, 0, 0, width, height);
        },
        close: () => {},
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to decode reference image for compression."));
    };
    image.src = objectUrl;
  });
}

function getCompressedDimensions(width: number, height: number) {
  const longest = Math.max(width, height);
  if (longest <= MAX_REFERENCE_DIMENSION) {
    return { width, height };
  }

  const scale = MAX_REFERENCE_DIMENSION / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function blobToBytes(blob: Blob) {
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

export async function compressReferenceImagePayload<T extends ReferenceImagePayload>(
  payload: T,
  enabled: boolean,
): Promise<T> {
  if (!enabled || payload.bytes.length < MIN_BYTES_FOR_REFERENCE_COMPRESSION || !canCompressReferences()) {
    return payload;
  }

  const sourceBlob = new Blob([new Uint8Array(payload.bytes)], { type: payload.mimeType });
  let decoded: Awaited<ReturnType<typeof decodeImage>> | null = null;

  try {
    decoded = await decodeImage(sourceBlob);
    const dimensions = getCompressedDimensions(decoded.width, decoded.height);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");

    if (!context) {
      return payload;
    }

    context.fillStyle = "#fff";
    context.fillRect(0, 0, dimensions.width, dimensions.height);
    decoded.draw(context, dimensions.width, dimensions.height);

    let bestBlob: Blob | null = null;
    for (const quality of JPEG_QUALITY_STEPS) {
      const nextBlob = await canvasToBlob(canvas, "image/jpeg", quality);
      if (!nextBlob) {
        continue;
      }

      bestBlob = nextBlob;
      if (nextBlob.size <= TARGET_REFERENCE_BYTES) {
        break;
      }
    }

  if (!bestBlob || bestBlob.size >= payload.bytes.length) {
    return payload;
  }

  return {
    ...payload,
    filename: replaceExtension(payload.filename, "jpg"),
    mimeType: "image/jpeg",
    originalByteLength: payload.originalByteLength ?? payload.bytes.length,
    bytes: await blobToBytes(bestBlob),
  };
  } catch {
    return payload;
  } finally {
    decoded?.close();
  }
}
