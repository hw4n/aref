import { describe, expect, it } from "vitest";

import {
  applyZoomAtPoint,
  createInitialCamera,
  frameRect,
  resizeViewport,
  screenToWorld,
  worldToScreen,
} from "./camera-math";

describe("camera math", () => {
  it("keeps the hovered world point stable when zooming", () => {
    const camera = resizeViewport(createInitialCamera(), 1200, 800);
    const pointer = { x: 320, y: 280 };
    const before = screenToWorld(camera, pointer);
    const nextCamera = applyZoomAtPoint(camera, pointer, 1.35);
    const after = screenToWorld(nextCamera, pointer);

    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it("frames a rect into the viewport", () => {
    const camera = resizeViewport(createInitialCamera(), 1000, 800);
    const nextCamera = frameRect(camera, {
      x: -200,
      y: -100,
      width: 400,
      height: 200,
    });

    const center = worldToScreen(nextCamera, { x: 0, y: 0 });

    expect(center.x).toBeCloseTo(500, 5);
    expect(center.y).toBeCloseTo(400, 5);
    expect(nextCamera.zoom).toBeGreaterThan(1);
  });
});
