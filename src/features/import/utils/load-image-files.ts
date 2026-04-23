import { ingestImportedFile } from "@/features/project/persistence/project-io";

export async function loadImageFiles(files: File[]) {
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  return Promise.all(imageFiles.map((file) => ingestImportedFile(file)));
}
