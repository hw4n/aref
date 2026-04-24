import type { Rect, Point } from "@/domain/shared/types";

import type { CanvasCamera } from "./types";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 24;

export function createInitialCamera(): CanvasCamera {
  return {
    x: 0,
    y: 0,
    zoom: 1,
    viewportWidth: 0,
    viewportHeight: 0,
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToWorld(camera: CanvasCamera, point: Point): Point {
  return {
    x: (point.x - camera.x) / camera.zoom,
    y: (point.y - camera.y) / camera.zoom,
  };
}

export function worldToScreen(camera: CanvasCamera, point: Point): Point {
  return {
    x: point.x * camera.zoom + camera.x,
    y: point.y * camera.zoom + camera.y,
  };
}

export function resizeViewport(
  camera: CanvasCamera,
  viewportWidth: number,
  viewportHeight: number,
): CanvasCamera {
  if (camera.viewportWidth === 0 || camera.viewportHeight === 0) {
    return {
      ...camera,
      x: viewportWidth / 2,
      y: viewportHeight / 2,
      viewportWidth,
      viewportHeight,
    };
  }

  const currentCenter = screenToWorld(camera, {
    x: camera.viewportWidth / 2,
    y: camera.viewportHeight / 2,
  });

  return {
    ...camera,
    x: viewportWidth / 2 - currentCenter.x * camera.zoom,
    y: viewportHeight / 2 - currentCenter.y * camera.zoom,
    viewportWidth,
    viewportHeight,
  };
}

export function panCamera(
  camera: CanvasCamera,
  deltaX: number,
  deltaY: number,
): CanvasCamera {
  return {
    ...camera,
    x: camera.x + deltaX,
    y: camera.y + deltaY,
  };
}

export function applyZoomAtPoint(
  camera: CanvasCamera,
  pointer: Point,
  zoomFactor: number,
): CanvasCamera {
  const worldPoint = screenToWorld(camera, pointer);
  const zoom = clampZoom(camera.zoom * zoomFactor);

  return {
    ...camera,
    zoom,
    x: pointer.x - worldPoint.x * zoom,
    y: pointer.y - worldPoint.y * zoom,
  };
}

export function resetCameraZoom(camera: CanvasCamera): CanvasCamera {
  const centerPoint = {
    x: camera.viewportWidth / 2,
    y: camera.viewportHeight / 2,
  };
  const worldCenter = screenToWorld(camera, centerPoint);

  return {
    ...camera,
    zoom: 1,
    x: centerPoint.x - worldCenter.x,
    y: centerPoint.y - worldCenter.y,
  };
}

export function centerRect(camera: CanvasCamera, rect: Rect): CanvasCamera {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  return {
    ...camera,
    x: camera.viewportWidth / 2 - centerX * camera.zoom,
    y: camera.viewportHeight / 2 - centerY * camera.zoom,
  };
}

export function frameRect(
  camera: CanvasCamera,
  rect: Rect,
  padding = 96,
): CanvasCamera {
  const safeWidth = Math.max(rect.width, 1);
  const safeHeight = Math.max(rect.height, 1);
  const availableWidth = Math.max(camera.viewportWidth - padding * 2, 1);
  const availableHeight = Math.max(camera.viewportHeight - padding * 2, 1);
  const zoom = clampZoom(Math.min(availableWidth / safeWidth, availableHeight / safeHeight));
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  return {
    ...camera,
    zoom,
    x: camera.viewportWidth / 2 - centerX * zoom,
    y: camera.viewportHeight / 2 - centerY * zoom,
  };
}
