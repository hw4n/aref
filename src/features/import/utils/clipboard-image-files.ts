function isImageMimeType(type: string | null | undefined) {
  return Boolean(type && type.startsWith("image/"));
}

function mimeTypeToExtension(type: string | null | undefined) {
  if (!type) {
    return "png";
  }

  const subtype = type.split("/")[1]?.toLowerCase() ?? "png";
  return subtype === "svg+xml" ? "svg" : subtype;
}

function normalizeClipboardFile(file: File, index: number) {
  if (file.name && file.name.trim().length > 0) {
    return file;
  }

  const timestamp = Date.now();
  const extension = mimeTypeToExtension(file.type);
  return new File([file], `clipboard-image-${timestamp}-${index + 1}.${extension}`, {
    type: file.type || "image/png",
    lastModified: file.lastModified || timestamp,
  });
}

function decodeBase64Payload(value: string) {
  const normalized = value.replace(/\s+/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function dataUrlToClipboardFile(dataUrl: string, index: number) {
  const trimmed = dataUrl.trim();

  if (!trimmed.startsWith("data:image/")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf(",");
  if (separatorIndex === -1) {
    return null;
  }

  const metadata = trimmed.slice(5, separatorIndex);
  const payload = trimmed.slice(separatorIndex + 1);
  const [mimeTypePart, ...flags] = metadata.split(";");
  const mimeType = mimeTypePart || "image/png";
  const isBase64 = flags.includes("base64");
  const bytes = isBase64
    ? decodeBase64Payload(payload)
    : new TextEncoder().encode(decodeURIComponent(payload));
  const extension = mimeTypeToExtension(mimeType);

  return new File([bytes], `clipboard-image-${Date.now()}-${index + 1}.${extension}`, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

export function extractImageDataUrlsFromHtml(html: string) {
  const trimmed = html.trim();

  if (!trimmed) {
    return [];
  }

  if (typeof DOMParser === "undefined") {
    return [];
  }

  const document = new DOMParser().parseFromString(trimmed, "text/html");
  return Array.from(document.querySelectorAll("img"))
    .map((image) => image.getAttribute("src"))
    .filter((src): src is string => Boolean(src && src.startsWith("data:image/")));
}

export interface ClipboardFileItemLike {
  kind: string;
  type: string;
  getAsFile: () => File | null;
}

export interface ClipboardDataLike {
  items?: Iterable<ClipboardFileItemLike> | ArrayLike<ClipboardFileItemLike> | null;
  files?: Iterable<File> | ArrayLike<File> | null;
  getData: (type: string) => string;
}

export function getClipboardImageFiles(clipboardData: ClipboardDataLike | null) {
  if (!clipboardData) {
    return [];
  }

  const itemFiles = Array.from(clipboardData.items ?? [])
    .filter((item) => item.kind === "file" && isImageMimeType(item.type))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
    .map(normalizeClipboardFile);

  if (itemFiles.length > 0) {
    return itemFiles;
  }

  const fileList = Array.from(clipboardData.files ?? [])
    .filter((file) => isImageMimeType(file.type))
    .map(normalizeClipboardFile);

  if (fileList.length > 0) {
    return fileList;
  }

  const plainText = clipboardData.getData("text/plain").trim();
  const html = clipboardData.getData("text/html");
  const dataUrls = Array.from(
    new Set([
      ...(plainText.startsWith("data:image/") ? [plainText] : []),
      ...extractImageDataUrlsFromHtml(html),
    ]),
  );

  return dataUrls
    .map((dataUrl, index) => dataUrlToClipboardFile(dataUrl, index))
    .filter((file): file is File => Boolean(file));
}
