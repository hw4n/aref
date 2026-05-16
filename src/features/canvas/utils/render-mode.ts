import { isImageAsset, type AssetItem } from "@/domain/assets/types";

export type CanvasRenderMode = "interactive" | "settled";

export const CANVAS_RENDER_SETTLE_MS = 180;
export const CANVAS_SETTLED_PREVIEW_MAX_RENDERED_DIMENSION = 1024;

export interface CanvasRenderActivityState {
  isCameraRenderSettling: boolean;
  isInteractionRenderSettling: boolean;
  hasMarqueeSession: boolean;
}

export function getCanvasRenderMode(state: CanvasRenderActivityState): CanvasRenderMode {
  return state.isCameraRenderSettling
    || state.isInteractionRenderSettling
    || state.hasMarqueeSession
    ? "interactive"
    : "settled";
}

export function shouldUseCanvasPreviewImage(
  asset: AssetItem,
  renderMode: CanvasRenderMode,
  renderedMaxDimension = Number.POSITIVE_INFINITY,
) {
  return isImageAsset(asset)
    && Boolean(asset.thumbnailPath)
    && (
      renderMode === "interactive"
      || renderedMaxDimension <= CANVAS_SETTLED_PREVIEW_MAX_RENDERED_DIMENSION
    );
}

export function getCanvasImagePreloadSources({
  asset,
  renderMode,
  renderedMaxDimension,
  intersectsRenderViewport,
  isPinned,
}: {
  asset: AssetItem;
  renderMode: CanvasRenderMode;
  renderedMaxDimension: number;
  intersectsRenderViewport: boolean;
  isPinned: boolean;
}) {
  if (!isImageAsset(asset)) {
    return [];
  }

  const sources: string[] = [];

  if (asset.thumbnailPath) {
    sources.push(asset.thumbnailPath);
  }

  const usesPreviewImage = shouldUseCanvasPreviewImage(asset, renderMode, renderedMaxDimension);

  if (!usesPreviewImage && (intersectsRenderViewport || isPinned)) {
    sources.push(asset.imagePath);
  }

  return sources;
}
