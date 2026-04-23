import type { AssetItem } from "@/domain/assets/types";
import type { Project } from "@/domain/project/types";

export const PROJECT_FILE_SCHEMA = "app.aref/project";
export const PROJECT_FILE_SCHEMA_VERSION = 2;

export interface RecentProjectRecord {
  path: string;
  name: string;
  lastOpenedAt: string;
  exists: boolean;
}

export interface ProjectPersistenceHandle {
  path: string | null;
  project: Project;
}

export interface SaveProjectResult {
  path: string;
  recentProjects: RecentProjectRecord[];
}

export interface PersistedAssetSourcePath {
  kind: "path";
  path: string;
}

export interface PersistedAssetSourceBytes {
  kind: "bytes";
  filename: string | null;
  bytes: number[];
}

export type PersistedAssetSource = PersistedAssetSourcePath | PersistedAssetSourceBytes;

export interface ProjectAssetSourcePayload {
  assetId: string;
  image: PersistedAssetSource;
  thumbnail?: PersistedAssetSource | null;
}

export interface SaveProjectRequest {
  path: string;
  project: Project;
  assetSources: ProjectAssetSourcePayload[];
}

export interface SaveAutosaveRequest {
  currentProjectPath: string | null;
  project: Project;
  assetSources: ProjectAssetSourcePayload[];
}

export interface PersistedProjectAssetRecordV2
  extends Omit<AssetItem, "imagePath" | "thumbnailPath"> {
  imagePath: string;
  thumbnailPath: string | null;
}

export interface PersistedProjectFileV2 {
  schema: typeof PROJECT_FILE_SCHEMA;
  schemaVersion: typeof PROJECT_FILE_SCHEMA_VERSION;
  appVersion: string;
  savedAt: string;
  project: {
    id: string;
    name: string;
    version: string;
    createdAt: string;
    updatedAt: string;
    camera: Project["camera"];
    assets: PersistedProjectAssetRecordV2[];
    groups: Array<Project["groups"][string]>;
    selection: Omit<Project["selection"], "marquee"> & { marquee: null };
    jobs: Array<Project["jobs"][string]>;
  };
}
