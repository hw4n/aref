import { getAssetBounds } from "@/domain/assets/asset-geometry";
import type { AssetItem } from "@/domain/assets/types";
import type { CameraState } from "@/domain/camera/types";
import { rectsIntersect } from "@/domain/shared/geometry";
import type { Rect } from "@/domain/shared/types";

export const CANVAS_RENDER_OVERSCAN_SCREENS = 1.25;
export const CANVAS_PRELOAD_OVERSCAN_SCREENS = 2.5;
export const CANVAS_RETAIN_OVERSCAN_SCREENS = 3.5;

export function getCameraWorldViewport(camera: CameraState): Rect {
  const zoom = Math.max(camera.zoom, 0.001);

  return {
    x: -camera.x / zoom,
    y: -camera.y / zoom,
    width: camera.viewportWidth / zoom,
    height: camera.viewportHeight / zoom,
  };
}

export function expandRect(rect: Rect, horizontal: number, vertical: number): Rect {
  return {
    x: rect.x - horizontal,
    y: rect.y - vertical,
    width: rect.width + horizontal * 2,
    height: rect.height + vertical * 2,
  };
}

export function getCameraOverscanViewport(camera: CameraState, overscanScreens: number): Rect {
  const viewport = getCameraWorldViewport(camera);

  return expandRect(
    viewport,
    viewport.width * overscanScreens,
    viewport.height * overscanScreens,
  );
}

export function assetIntersectsViewport(asset: AssetItem, viewport: Rect) {
  return rectsIntersect(getAssetBounds(asset), viewport);
}

export interface ViewportRenderAssetPlanPreloadContext {
  intersectsRenderViewport: boolean;
  intersectsPreloadViewport: boolean;
  isPinned: boolean;
}

export interface ViewportRenderAssetPlan {
  targetRenderAssetIds: string[];
  retainedRenderAssetIds: string[];
  preloadSources: string[];
}

export function getViewportRenderAssetPlan({
  assets,
  renderViewport,
  retainViewport,
  preloadViewport,
  selectedAssetIds,
  editingTextAssetId,
  getPreloadSources,
  getBounds = getAssetBounds,
}: {
  assets: readonly AssetItem[];
  renderViewport: Rect;
  retainViewport: Rect;
  preloadViewport: Rect;
  selectedAssetIds: ReadonlySet<string>;
  editingTextAssetId: string | null;
  getPreloadSources?: (
    asset: AssetItem,
    context: ViewportRenderAssetPlanPreloadContext,
  ) => readonly string[];
  getBounds?: (asset: AssetItem) => Rect;
}): ViewportRenderAssetPlan {
  const targetRenderAssetIds: string[] = [];
  const retainedRenderAssetIds: string[] = [];
  const preloadSources = new Set<string>();

  for (const asset of assets) {
    const bounds = getBounds(asset);
    const isPinned = selectedAssetIds.has(asset.id) || editingTextAssetId === asset.id;
    const intersectsRenderViewport = rectsIntersect(bounds, renderViewport);
    const intersectsRetainViewport = intersectsRenderViewport || rectsIntersect(bounds, retainViewport);
    const intersectsPreloadViewport = rectsIntersect(bounds, preloadViewport);

    if (isPinned || intersectsRenderViewport) {
      targetRenderAssetIds.push(asset.id);
    }

    if (isPinned || intersectsRetainViewport) {
      retainedRenderAssetIds.push(asset.id);
    }

    if (getPreloadSources && intersectsPreloadViewport) {
      for (const source of getPreloadSources(asset, {
        intersectsRenderViewport,
        intersectsPreloadViewport,
        isPinned,
      })) {
        if (source) {
          preloadSources.add(source);
        }
      }
    }
  }

  return {
    targetRenderAssetIds,
    retainedRenderAssetIds,
    preloadSources: [...preloadSources],
  };
}

export function getStableRenderAssetIds({
  currentIds,
  targetIds,
  retainedIds,
  pruneToTarget,
}: {
  currentIds: readonly string[];
  targetIds: readonly string[];
  retainedIds: readonly string[];
  pruneToTarget: boolean;
}) {
  if (pruneToTarget) {
    return [...targetIds];
  }

  const targetIdSet = new Set(targetIds);
  const retainedIdSet = new Set(retainedIds);
  const nextIds = new Set<string>();

  for (const id of currentIds) {
    if (retainedIdSet.has(id) || targetIdSet.has(id)) {
      nextIds.add(id);
    }
  }

  for (const id of targetIds) {
    nextIds.add(id);
  }

  return [...nextIds];
}
