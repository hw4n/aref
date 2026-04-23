import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

import type { ImportedImageDraft } from "@/domain/assets/imported-asset-utils";
import type { Project } from "@/domain/project/types";

import type {
  ProjectAssetSourcePayload,
  ProjectPersistenceHandle,
  RecentProjectRecord,
  SaveAutosaveRequest,
  SaveProjectRequest,
  SaveProjectResult,
} from "./types";
import { hasTauriRuntime } from "./tauri-runtime";

const PROJECT_FILE_EXTENSIONS = ["aref"];

function isRemoteUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

export function isLikelyFilePath(value: string) {
  if (value.startsWith("blob:") || value.startsWith("data:") || isRemoteUrl(value)) {
    return false;
  }

  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

function sanitizeFileNameSegment(value: string) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function toProjectFileName(name: string) {
  const baseName = sanitizeFileNameSegment(name) || "Untitled Board";
  return baseName.endsWith(".aref") ? baseName : `${baseName}.aref`;
}

function guessExtension(sourceName: string | undefined, imagePath: string) {
  const directName = sourceName?.split(/[\\/]/).at(-1) ?? null;
  const directExt = directName?.includes(".") ? directName.split(".").at(-1)?.toLowerCase() : null;

  if (directExt) {
    return directExt;
  }

  if (imagePath.startsWith("data:image/")) {
    const mime = imagePath.slice("data:image/".length).split(/[;+]/)[0]?.toLowerCase();
    if (mime === "svg+xml") {
      return "svg";
    }
    if (mime) {
      return mime;
    }
  }

  if (isLikelyFilePath(imagePath)) {
    const ext = imagePath.split(".").at(-1)?.toLowerCase();
    if (ext && !ext.includes("/") && !ext.includes("\\")) {
      return ext;
    }
  }

  return "png";
}

async function toBytes(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to read asset payload: ${response.status} ${response.statusText}`);
  }

  return Array.from(new Uint8Array(await response.arrayBuffer()));
}

async function createAssetSourcePayload(project: Project): Promise<ProjectAssetSourcePayload[]> {
  const assets = Object.values(project.assets);

  return Promise.all(
    assets.map(async (asset) => {
      if (isLikelyFilePath(asset.imagePath)) {
        return {
          assetId: asset.id,
          image: {
            kind: "path" as const,
            path: asset.imagePath,
          },
          thumbnail: asset.thumbnailPath && isLikelyFilePath(asset.thumbnailPath)
            ? {
                kind: "path" as const,
                path: asset.thumbnailPath,
              }
            : null,
        };
      }

      const extension = guessExtension(asset.sourceName, asset.imagePath);

      return {
        assetId: asset.id,
        image: {
          kind: "bytes" as const,
          filename: `${asset.id}.${extension}`,
          bytes: await toBytes(asset.imagePath),
        },
        thumbnail: null,
      };
    }),
  );
}

export async function chooseOpenProjectPath() {
  if (!hasTauriRuntime()) {
    return null;
  }

  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Aref Project", extensions: PROJECT_FILE_EXTENSIONS }],
  });

  return typeof selected === "string" ? selected : null;
}

export async function chooseSaveProjectPath(projectName: string, currentProjectPath: string | null) {
  if (!hasTauriRuntime()) {
    return null;
  }

  return save({
    defaultPath: currentProjectPath ?? toProjectFileName(projectName),
    filters: [{ name: "Aref Project", extensions: PROJECT_FILE_EXTENSIONS }],
  });
}

export async function ingestImportedFile(file: File): Promise<ImportedImageDraft> {
  const transientUrl = URL.createObjectURL(file);

  try {
    const metadata = await new Promise<Omit<ImportedImageDraft, "imagePath">>((resolve, reject) => {
      const image = new window.Image();

      image.onload = () => {
        resolve({
          sourceName: file.name,
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      };

      image.onerror = () => reject(new Error(`Failed to load image file: ${file.name}`));
      image.src = transientUrl;
    });

    if (!hasTauriRuntime()) {
      return {
        ...metadata,
        imagePath: transientUrl,
      };
    }

    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    const imagePath = await invoke<string>("ingest_image_asset", {
      filename: file.name,
      bytes,
    });

    return {
      ...metadata,
      imagePath,
    };
  } finally {
    if (hasTauriRuntime()) {
      URL.revokeObjectURL(transientUrl);
    }
  }
}

export async function readManagedImageBytes(path: string) {
  return invoke<number[]>("read_image_bytes", { path });
}

export async function loadProjectFromPath(path: string) {
  return invoke<ProjectPersistenceHandle>("load_project_file", { path });
}

export async function loadStartupProject() {
  return invoke<ProjectPersistenceHandle | null>("load_startup_project");
}

export async function listRecentProjects() {
  return invoke<RecentProjectRecord[]>("list_recent_projects");
}

export async function saveProjectToPath(path: string, project: Project): Promise<SaveProjectResult> {
  const request: SaveProjectRequest = {
    path,
    project,
    assetSources: await createAssetSourcePayload(project),
  };

  return invoke<SaveProjectResult>("save_project_file", { request });
}

export async function saveAutosaveProject(project: Project, currentProjectPath: string | null) {
  const request: SaveAutosaveRequest = {
    currentProjectPath,
    project,
    assetSources: await createAssetSourcePayload(project),
  };

  return invoke<void>("save_autosave_project", { request });
}
