import type { Rect } from "@/domain/shared/types";

import type { AssetItem } from "./types";

function rotatePoint(x: number, y: number, radians: number) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

export function getAssetBounds(asset: AssetItem): Rect {
  const halfWidth = (asset.width * asset.scale) / 2;
  const halfHeight = (asset.height * asset.scale) / 2;
  const radians = (asset.rotation * Math.PI) / 180;
  const corners = [
    rotatePoint(-halfWidth, -halfHeight, radians),
    rotatePoint(halfWidth, -halfHeight, radians),
    rotatePoint(halfWidth, halfHeight, radians),
    rotatePoint(-halfWidth, halfHeight, radians),
  ];

  const xs = corners.map((corner) => corner.x + asset.x);
  const ys = corners.map((corner) => corner.y + asset.y);

  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

export function getAssetsBounds(assets: AssetItem[]): Rect | null {
  if (assets.length === 0) {
    return null;
  }

  const bounds = assets.map(getAssetBounds);
  const minX = Math.min(...bounds.map((bound) => bound.x));
  const minY = Math.min(...bounds.map((bound) => bound.y));
  const maxX = Math.max(...bounds.map((bound) => bound.x + bound.width));
  const maxY = Math.max(...bounds.map((bound) => bound.y + bound.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
