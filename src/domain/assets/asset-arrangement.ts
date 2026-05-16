import { arrangeRectsWithoutOverlap, type RectArrangementOptions } from "@/domain/shared/rect-arrangement";

import { getAssetBounds } from "./asset-geometry";
import type { AssetItem } from "./types";

export function arrangeAssetsWithoutOverlap(
  assets: AssetItem[],
  options?: RectArrangementOptions,
) {
  return arrangeRectsWithoutOverlap(
    assets.map((asset) => {
      const bounds = getAssetBounds(asset);

      return {
        id: asset.id,
        bounds,
        anchor: {
          x: asset.x - bounds.x,
          y: asset.y - bounds.y,
        },
      };
    }),
    options,
  );
}
