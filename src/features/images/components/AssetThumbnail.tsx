import { useEffect } from "react";

import type { AssetItem } from "@/domain/assets/types";
import {
  createManagedImageThumbnail,
  isLikelyFilePath,
} from "@/features/project/persistence/project-io";
import { appStore, useAppStore } from "@/state/app-store";

import { useRenderableImageUrl } from "../hooks/use-renderable-image-url";

const THUMBNAIL_BACKFILL_DELAY_MS = 700;

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function RenderableImage({ src }: { src: string }) {
  const renderableSrc = useRenderableImageUrl(src);

  return <img alt="" src={renderableSrc} />;
}

function getAssetInitial(asset: AssetItem) {
  return (asset.sourceName ?? asset.kind).trim().charAt(0).toUpperCase() || "?";
}

function scheduleThumbnailBackfill(callback: () => void) {
  const browserWindow = window as WindowWithIdleCallback;
  let idleHandle: number | null = null;
  const timeoutHandle = window.setTimeout(() => {
    if (browserWindow.requestIdleCallback) {
      idleHandle = browserWindow.requestIdleCallback(callback, { timeout: 1500 });
      return;
    }

    callback();
  }, THUMBNAIL_BACKFILL_DELAY_MS);

  return () => {
    window.clearTimeout(timeoutHandle);
    if (idleHandle !== null) {
      browserWindow.cancelIdleCallback?.(idleHandle);
    }
  };
}

export function AssetThumbnail({ asset }: { asset: AssetItem }) {
  const setAssetThumbnailPath = useAppStore((state) => state.setAssetThumbnailPath);
  const isCanvasInteractionActive = useAppStore((state) => state.isCanvasInteractionActive);
  const source = asset.thumbnailPath ?? (isLikelyFilePath(asset.imagePath) ? null : asset.imagePath);
  const shouldBackfillThumbnail = !asset.thumbnailPath && isLikelyFilePath(asset.imagePath);

  useEffect(() => {
    if (!shouldBackfillThumbnail || isCanvasInteractionActive) {
      return;
    }

    let cancelled = false;
    const cancelSchedule = scheduleThumbnailBackfill(() => {
      if (cancelled || appStore.getState().isCanvasInteractionActive) {
        return;
      }

      void createManagedImageThumbnail({
        imagePath: asset.imagePath,
        sourceName: asset.sourceName,
        thumbnailPath: asset.thumbnailPath,
      }).then((thumbnailPath) => {
        if (!cancelled && thumbnailPath) {
          setAssetThumbnailPath(asset.id, thumbnailPath);
        }
      });
    });

    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [
    asset.id,
    asset.imagePath,
    asset.sourceName,
    asset.thumbnailPath,
    isCanvasInteractionActive,
    setAssetThumbnailPath,
    shouldBackfillThumbnail,
  ]);

  if (source) {
    return <RenderableImage src={source} />;
  }

  return (
    <span className="asset-thumb-placeholder" aria-hidden="true">
      <span>{getAssetInitial(asset)}</span>
    </span>
  );
}
