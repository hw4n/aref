import { screenToWorld } from "@/domain/camera/camera-math";
import type { CameraState } from "@/domain/camera/types";
import type { Point } from "@/domain/shared/types";

import type { AssetItem } from "./types";

export interface ImportedImageDraft {
  imagePath: string;
  sourceName: string;
  thumbnailPath?: string | null;
  width: number;
  height: number;
}

const IMPORT_TARGET_MAX_DIMENSION = 360;
const IMPORT_SPACING = 44;

function computeImportScale(width: number, height: number) {
  const maxDimension = Math.max(width, height, 1);
  return Math.min(1, IMPORT_TARGET_MAX_DIMENSION / maxDimension);
}

function getImportOrigin(camera: CameraState) {
  return screenToWorld(camera, {
    x: camera.viewportWidth / 2,
    y: camera.viewportHeight / 2,
  });
}

export function createImportedAssets(
  drafts: ImportedImageDraft[],
  existingAssets: Record<string, AssetItem>,
  camera: CameraState,
): AssetItem[] {
  const timestamp = new Date().toISOString();
  const importOrigin = getImportOrigin(camera);
  const nextZIndex = Object.values(existingAssets).reduce(
    (highest, asset) => Math.max(highest, asset.zIndex),
    -1,
  ) + 1;

  return drafts.map((draft, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const offset: Point = {
      x: (column - 1) * IMPORT_SPACING * 4,
      y: row * IMPORT_SPACING * 3,
    };

    return {
      id: crypto.randomUUID(),
      kind: "imported",
      imagePath: draft.imagePath,
      sourceName: draft.sourceName,
      thumbnailPath: draft.thumbnailPath ?? null,
      width: draft.width,
      height: draft.height,
      x: importOrigin.x + offset.x,
      y: importOrigin.y + offset.y,
      rotation: 0,
      scale: computeImportScale(draft.width, draft.height),
      zIndex: nextZIndex + index,
      locked: false,
      hidden: false,
      tags: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}
