import { ingestImportedFile } from "@/features/project/persistence/project-io";
import { readManagedImageBytes } from "@/features/project/persistence/project-io";

import {
  filterSupportedImageFiles,
  filterSupportedImagePaths,
  getFileNameFromPath,
  getImageMimeTypeFromName,
} from "./image-file";

export async function loadImageFiles(files: File[]) {
  const imageFiles = filterSupportedImageFiles(files);
  return Promise.all(imageFiles.map((file) => ingestImportedFile(file)));
}

export async function loadImagePaths(paths: string[]) {
  const imagePaths = filterSupportedImagePaths(paths);

  return Promise.all(
    imagePaths.map(async (path) => {
      const bytes = new Uint8Array(await readManagedImageBytes(path));
      const fileName = getFileNameFromPath(path);
      const file = new File([bytes], fileName, {
        type: getImageMimeTypeFromName(fileName),
      });

      return ingestImportedFile(file);
    }),
  );
}
