import { isImageAsset, type AssetItem } from "@/domain/assets/types";

export type CanvasRenderMode = "interactive" | "settled";

export const CANVAS_RENDER_SETTLE_MS = 180;

export interface CanvasRenderActivityState {
  isCameraRenderSettling: boolean;
  isInteractionRenderSettling: boolean;
  isPanning: boolean;
  hasMarqueeSession: boolean;
}

export function getCanvasRenderMode(state: CanvasRenderActivityState): CanvasRenderMode {
  return state.isCameraRenderSettling
    || state.isInteractionRenderSettling
    || state.isPanning
    || state.hasMarqueeSession
    ? "interactive"
    : "settled";
}

export function shouldUseCanvasPreviewImage(asset: AssetItem, renderMode: CanvasRenderMode) {
  return renderMode === "interactive" && isImageAsset(asset) && Boolean(asset.thumbnailPath);
}
