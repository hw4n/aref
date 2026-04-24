const IMAGE_EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

const IMAGE_EXTENSIONS = new Set(Object.keys(IMAGE_EXTENSION_TO_MIME_TYPE));

export function getFileNameFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const fileName = normalized.split("/").filter(Boolean).at(-1);

  return fileName || "image.png";
}

export function getFileExtension(nameOrPath: string) {
  const fileName = getFileNameFromPath(nameOrPath);
  const extension = fileName.includes(".") ? fileName.split(".").at(-1)?.toLowerCase() : null;

  return extension ?? "";
}

export function isSupportedImageName(nameOrPath: string) {
  return IMAGE_EXTENSIONS.has(getFileExtension(nameOrPath));
}

export function isSupportedImageMimeType(mimeType: string) {
  return mimeType.startsWith("image/");
}

export function isSupportedImageFile(file: File) {
  return isSupportedImageMimeType(file.type) || isSupportedImageName(file.name);
}

export function getImageMimeTypeFromName(nameOrPath: string) {
  return IMAGE_EXTENSION_TO_MIME_TYPE[getFileExtension(nameOrPath)] ?? "image/png";
}

export function filterSupportedImageFiles(files: File[]) {
  return files.filter(isSupportedImageFile);
}

export function filterSupportedImagePaths(paths: string[]) {
  return paths.filter(isSupportedImageName);
}
