export const CANVAS_RENDER_SCALES = [1, 0.75, 0.5, 0.25] as const;

export type CanvasRenderScale = typeof CANVAS_RENDER_SCALES[number];

export function normalizeCanvasRenderScale(value: unknown): CanvasRenderScale {
  return CANVAS_RENDER_SCALES.find((scale) => scale === value) ?? 1;
}

export function getCanvasPixelRatio(
  renderScale: CanvasRenderScale,
  devicePixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio,
) {
  const safeDevicePixelRatio =
    typeof devicePixelRatio === "number" && Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;

  return Math.max(0.25, Math.round(safeDevicePixelRatio * renderScale * 100) / 100);
}
