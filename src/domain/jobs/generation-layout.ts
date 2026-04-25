import { screenToWorld } from "@/domain/camera/camera-math";
import type { CameraState } from "@/domain/camera/types";
import type { Point } from "@/domain/shared/types";

import type { GenerationImageSize } from "./types";

const GENERATED_TARGET_MAX_DIMENSION = 360;
const GENERATED_SPACING = 40;

export function computeGeneratedScale(width: number, height: number) {
  const maxDimension = Math.max(width, height, 1);
  return Math.min(1, GENERATED_TARGET_MAX_DIMENSION / maxDimension);
}

export function getGenerationSourceSize(size: GenerationImageSize) {
  if (size === "1536x1024") {
    return { width: 1536, height: 1024 };
  }

  if (size === "1024x1536") {
    return { width: 1024, height: 1536 };
  }

  if (size === "2048x2048") {
    return { width: 2048, height: 2048 };
  }

  if (size === "2048x1152") {
    return { width: 2048, height: 1152 };
  }

  if (size === "3840x2160") {
    return { width: 3840, height: 2160 };
  }

  if (size === "2160x3840") {
    return { width: 2160, height: 3840 };
  }

  return { width: 1024, height: 1024 };
}

export function getGenerationDisplaySize(width: number, height: number) {
  const scale = computeGeneratedScale(width, height);
  return {
    width: width * scale,
    height: height * scale,
    scale,
  };
}

export function getGenerationDisplaySizeForSize(size: GenerationImageSize) {
  const sourceSize = getGenerationSourceSize(size);
  return getGenerationDisplaySize(sourceSize.width, sourceSize.height);
}

export function getViewportCenter(camera: CameraState) {
  return screenToWorld(camera, {
    x: camera.viewportWidth / 2,
    y: camera.viewportHeight / 2,
  });
}

export function computeGenerationCanvasLayout(
  frames: Array<{ width: number; height: number }>,
  origin: Point,
): Point[] {
  if (frames.length === 0) {
    return [];
  }

  const columnCount = Math.min(2, Math.max(1, frames.length));
  const rowCount = Math.ceil(frames.length / columnCount);
  const columnWidths = Array.from({ length: columnCount }, (_unused, columnIndex) =>
    Math.max(
      ...frames
        .filter((_frame, frameIndex) => frameIndex % columnCount === columnIndex)
        .map((frame) => frame.width),
      0,
    ),
  );
  const rowHeights = Array.from({ length: rowCount }, (_unused, rowIndex) =>
    Math.max(
      ...frames
        .filter((_frame, frameIndex) => Math.floor(frameIndex / columnCount) === rowIndex)
        .map((frame) => frame.height),
      0,
    ),
  );
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0) + GENERATED_SPACING * (columnCount - 1);
  const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0) + GENERATED_SPACING * (rowCount - 1);
  const startX = origin.x - totalWidth / 2;
  const startY = origin.y - totalHeight / 2;

  return frames.map((frame, index) => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const leadingWidth = columnWidths.slice(0, column).reduce((sum, width) => sum + width, 0);
    const leadingHeight = rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0);

    return {
      x:
        startX
        + leadingWidth
        + GENERATED_SPACING * column
        + columnWidths[column]! / 2,
      y:
        startY
        + leadingHeight
        + GENERATED_SPACING * row
        + rowHeights[row]! / 2,
    };
  });
}
