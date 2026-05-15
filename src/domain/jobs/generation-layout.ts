import { screenToWorld } from "@/domain/camera/camera-math";
import type { CameraState } from "@/domain/camera/types";
import { rectsIntersect } from "@/domain/shared/geometry";
import type { Point, Rect } from "@/domain/shared/types";

import type { GenerationImageSize, GenerationJob, GenerationRequest } from "./types";

const GENERATED_TARGET_MAX_DIMENSION = 360;
const GENERATED_SPACING = 40;
const GENERATION_PLACEHOLDER_PADDING = 10;
const GENERATION_JOB_GRID_GAP = 56;

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

function rectFromFrame(center: Point, frame: { width: number; height: number }): Rect {
  return {
    x: center.x - frame.width / 2 - GENERATION_PLACEHOLDER_PADDING,
    y: center.y - frame.height / 2 - GENERATION_PLACEHOLDER_PADDING,
    width: frame.width + GENERATION_PLACEHOLDER_PADDING * 2,
    height: frame.height + GENERATION_PLACEHOLDER_PADDING * 2,
  };
}

function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) {
    return null;
  }

  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function expandRect(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

export function getGenerationRequestPlaceholderBounds(
  request: GenerationRequest,
  origin: Point,
): Rect {
  const displaySize = getGenerationDisplaySizeForSize(request.settings.size);
  const frames = Array.from({ length: request.settings.imageCount }, () => ({
    width: displaySize.width,
    height: displaySize.height,
  }));
  const positions = computeGenerationCanvasLayout(frames, origin);
  const bounds = unionRects(positions.map((position, index) => rectFromFrame(position, frames[index]!)));

  return bounds ?? rectFromFrame(origin, displaySize);
}

export function computeBulkGenerationPlacements(
  request: GenerationRequest,
  columns: number,
  rows: number,
  origin: Point,
): Point[] {
  const safeColumns = Math.max(1, Math.floor(columns));
  const safeRows = Math.max(1, Math.floor(rows));
  const sampleBounds = getGenerationRequestPlaceholderBounds(request, origin);
  const totalWidth = sampleBounds.width * safeColumns + GENERATION_JOB_GRID_GAP * (safeColumns - 1);
  const totalHeight = sampleBounds.height * safeRows + GENERATION_JOB_GRID_GAP * (safeRows - 1);
  const startX = origin.x - totalWidth / 2 + sampleBounds.width / 2;
  const startY = origin.y - totalHeight / 2 + sampleBounds.height / 2;

  return Array.from({ length: safeColumns * safeRows }, (_unused, index) => {
    const column = index % safeColumns;
    const row = Math.floor(index / safeColumns);

    return {
      x: startX + column * (sampleBounds.width + GENERATION_JOB_GRID_GAP),
      y: startY + row * (sampleBounds.height + GENERATION_JOB_GRID_GAP),
    };
  });
}

export function findAvailableGenerationPlacement(
  request: GenerationRequest,
  existingJobs: GenerationJob[],
  origin: Point,
): Point {
  const sampleBounds = getGenerationRequestPlaceholderBounds(request, origin);
  const stepX = sampleBounds.width + GENERATION_JOB_GRID_GAP;
  const stepY = sampleBounds.height + GENERATION_JOB_GRID_GAP;
  const existingBounds = existingJobs.map((job) =>
    expandRect(getGenerationRequestPlaceholderBounds(job.request, job.canvasPlacement), GENERATION_JOB_GRID_GAP / 2),
  );

  for (let radius = 0; radius <= 12; radius += 1) {
    for (let row = -radius; row <= radius; row += 1) {
      for (let column = -radius; column <= radius; column += 1) {
        if (Math.max(Math.abs(row), Math.abs(column)) !== radius) {
          continue;
        }

        const placement = {
          x: origin.x + column * stepX,
          y: origin.y + row * stepY,
        };
        const candidateBounds = expandRect(
          getGenerationRequestPlaceholderBounds(request, placement),
          GENERATION_JOB_GRID_GAP / 2,
        );

        if (!existingBounds.some((bounds) => rectsIntersect(candidateBounds, bounds))) {
          return placement;
        }
      }
    }
  }

  return {
    x: origin.x,
    y: origin.y + stepY * (existingJobs.length + 1),
  };
}
