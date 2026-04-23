import { describe, expect, it } from "vitest";

import type { AssetItem } from "@/domain/assets/types";

import { getAssetBounds, getAssetsBounds } from "./asset-geometry";

function createAsset(partial: Partial<AssetItem> = {}): AssetItem {
  return {
    id: partial.id ?? "asset-1",
    kind: "imported",
    imagePath: "asset.png",
    thumbnailPath: null,
    width: partial.width ?? 200,
    height: partial.height ?? 100,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    rotation: partial.rotation ?? 0,
    scale: partial.scale ?? 1,
    zIndex: partial.zIndex ?? 0,
    locked: false,
    hidden: false,
    tags: [],
    createdAt: "2026-04-23T00:00:00.000Z",
    updatedAt: "2026-04-23T00:00:00.000Z",
  };
}

describe("asset geometry", () => {
  it("computes axis-aligned bounds for unrotated assets", () => {
    expect(getAssetBounds(createAsset())).toEqual({
      x: -100,
      y: -50,
      width: 200,
      height: 100,
    });
  });

  it("expands bounds when assets are rotated", () => {
    const bounds = getAssetBounds(createAsset({ rotation: 45 }));

    expect(bounds.width).toBeGreaterThan(200);
    expect(bounds.height).toBeGreaterThan(100);
  });

  it("combines multiple asset bounds into one rect", () => {
    const bounds = getAssetsBounds([
      createAsset({ id: "a", x: -100, y: -40 }),
      createAsset({ id: "b", x: 200, y: 160, scale: 0.5 }),
    ]);

    expect(bounds).toMatchObject({
      x: -200,
      y: -90,
    });
    expect(bounds?.width).toBeGreaterThan(400);
    expect(bounds?.height).toBeGreaterThan(250);
  });
});
