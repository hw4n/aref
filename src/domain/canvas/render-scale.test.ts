import { describe, expect, it } from "vitest";

import { getCanvasPixelRatio, normalizeCanvasRenderScale } from "./render-scale";

describe("canvas render scale", () => {
  it("normalizes render scale choices to supported values", () => {
    expect(normalizeCanvasRenderScale(0.5)).toBe(0.5);
    expect(normalizeCanvasRenderScale(0.33)).toBe(1);
    expect(normalizeCanvasRenderScale("0.5")).toBe(1);
  });

  it("multiplies render scale by the device pixel ratio", () => {
    expect(getCanvasPixelRatio(1, 2)).toBe(2);
    expect(getCanvasPixelRatio(0.5, 2)).toBe(1);
    expect(getCanvasPixelRatio(0.25, 1)).toBe(0.25);
  });
});
