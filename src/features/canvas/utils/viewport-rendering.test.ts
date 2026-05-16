import { describe, expect, it, vi } from "vitest";

import type { AssetItem } from "@/domain/assets/types";
import type { CameraState } from "@/domain/camera/types";

import {
  assetIntersectsViewport,
  expandRect,
  getCameraOverscanViewport,
  getStableRenderAssetIds,
  getCameraWorldViewport,
  getViewportRenderAssetPlan,
} from "./viewport-rendering";

function createCamera(partial: Partial<CameraState> = {}): CameraState {
  return {
    x: partial.x ?? 400,
    y: partial.y ?? 240,
    zoom: partial.zoom ?? 2,
    viewportWidth: partial.viewportWidth ?? 1200,
    viewportHeight: partial.viewportHeight ?? 800,
  };
}

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
    createdAt: "2026-05-13T00:00:00.000Z",
    updatedAt: "2026-05-13T00:00:00.000Z",
  };
}

describe("viewport rendering", () => {
  it("converts camera screen bounds to world bounds", () => {
    expect(getCameraWorldViewport(createCamera())).toEqual({
      x: -200,
      y: -120,
      width: 600,
      height: 400,
    });
  });

  it("expands rects around their center area", () => {
    expect(expandRect({ x: 10, y: 20, width: 100, height: 50 }, 25, 10)).toEqual({
      x: -15,
      y: 10,
      width: 150,
      height: 70,
    });
  });

  it("adds screen-based overscan around the visible camera viewport", () => {
    expect(getCameraOverscanViewport(createCamera(), 0.5)).toEqual({
      x: -500,
      y: -320,
      width: 1200,
      height: 800,
    });
  });

  it("tracks small camera movements exactly for render culling", () => {
    const beforePan = getCameraOverscanViewport(createCamera({
      x: 240,
      y: 180,
      zoom: 1,
      viewportWidth: 1000,
      viewportHeight: 800,
    }), 1);
    const afterPan = getCameraOverscanViewport(createCamera({
      x: 260,
      y: 240,
      zoom: 1,
      viewportWidth: 1000,
      viewportHeight: 800,
    }), 1);

    expect(afterPan.x - beforePan.x).toBe(-20);
    expect(afterPan.y - beforePan.y).toBe(-60);
  });

  it("detects assets that intersect the viewport", () => {
    const viewport = { x: -100, y: -100, width: 200, height: 200 };

    expect(assetIntersectsViewport(createAsset({ x: 0, y: 0 }), viewport)).toBe(true);
    expect(assetIntersectsViewport(createAsset({ x: 500, y: 0 }), viewport)).toBe(false);
  });

  it("keeps previously rendered assets while they remain in the retention viewport", () => {
    expect(getStableRenderAssetIds({
      currentIds: ["near-old", "far-old"],
      targetIds: ["new"],
      retainedIds: ["near-old", "new"],
      pruneToTarget: false,
    })).toEqual(["near-old", "new"]);
  });

  it("prunes stable render ids back to the target ids when settled", () => {
    expect(getStableRenderAssetIds({
      currentIds: ["near-old", "new"],
      targetIds: ["new"],
      retainedIds: ["near-old", "new"],
      pruneToTarget: true,
    })).toEqual(["new"]);
  });

  it("builds render and preload ids with one bounds pass per asset", () => {
    const assets = [
      createAsset({ id: "visible", x: 0 }),
      createAsset({ id: "retained", x: 300 }),
      createAsset({ id: "preload-only", x: 650 }),
      createAsset({ id: "far", x: 1200 }),
      createAsset({ id: "selected", x: 1400 }),
    ];
    const getBounds = vi.fn((asset: AssetItem) => ({
      x: asset.x - (asset.width * asset.scale) / 2,
      y: asset.y - (asset.height * asset.scale) / 2,
      width: asset.width * asset.scale,
      height: asset.height * asset.scale,
    }));

    const plan = getViewportRenderAssetPlan({
      assets,
      renderViewport: { x: -100, y: -100, width: 200, height: 200 },
      retainViewport: { x: -300, y: -100, width: 600, height: 200 },
      preloadViewport: { x: -700, y: -100, width: 1400, height: 200 },
      selectedAssetIds: new Set(["selected"]),
      editingTextAssetId: null,
      getPreloadSources: (asset, context) => [
        `${asset.id}:${context.intersectsRenderViewport ? "render" : "preload"}`,
      ],
      getBounds,
    });

    expect(getBounds).toHaveBeenCalledTimes(assets.length);
    expect(plan.targetRenderAssetIds).toEqual(["visible", "selected"]);
    expect(plan.retainedRenderAssetIds).toEqual(["visible", "retained", "selected"]);
    expect(plan.preloadSources).toEqual([
      "visible:render",
      "retained:preload",
      "preload-only:preload",
    ]);
  });
});
