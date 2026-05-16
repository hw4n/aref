import { describe, expect, it } from "vitest";

import { rectsIntersect } from "@/domain/shared/geometry";

import { arrangeAssetsWithoutOverlap } from "./asset-arrangement";
import { getAssetBounds } from "./asset-geometry";
import type { AssetItem } from "./types";

function createAsset(partial: Partial<AssetItem> & Pick<AssetItem, "id">): AssetItem {
  return {
    id: partial.id,
    kind: partial.kind ?? "imported",
    imagePath: partial.imagePath ?? "blob://asset",
    thumbnailPath: partial.thumbnailPath ?? null,
    width: partial.width ?? 240,
    height: partial.height ?? 180,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    rotation: partial.rotation ?? 0,
    scale: partial.scale ?? 1,
    zIndex: partial.zIndex ?? 0,
    locked: partial.locked ?? false,
    hidden: partial.hidden ?? false,
    tags: partial.tags ?? [],
    createdAt: partial.createdAt ?? "2026-05-16T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-05-16T00:00:00.000Z",
    generation: partial.generation,
    text: partial.text,
  };
}

describe("asset arrangement", () => {
  it("rearranges overlapping assets into non-overlapping cells", () => {
    const assets = [
      createAsset({ id: "asset-a", width: 220, height: 160, x: 0, y: 0, zIndex: 0 }),
      createAsset({ id: "asset-b", width: 180, height: 260, x: 20, y: 15, rotation: 8, zIndex: 1 }),
      createAsset({ id: "asset-c", width: 320, height: 160, x: -12, y: 18, zIndex: 2 }),
    ];
    const updates = arrangeAssetsWithoutOverlap(assets, { gap: 24 });
    const updatesById = new Map(updates.map((update) => [update.id, update.position]));
    const arrangedAssets = assets.map((asset) => ({
      ...asset,
      x: updatesById.get(asset.id)?.x ?? asset.x,
      y: updatesById.get(asset.id)?.y ?? asset.y,
    }));
    const arrangedBounds = arrangedAssets.map(getAssetBounds);

    expect(updates).toHaveLength(3);
    for (let index = 0; index < arrangedBounds.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < arrangedBounds.length; otherIndex += 1) {
        expect(rectsIntersect(arrangedBounds[index]!, arrangedBounds[otherIndex]!)).toBe(false);
      }
    }
  });
});
