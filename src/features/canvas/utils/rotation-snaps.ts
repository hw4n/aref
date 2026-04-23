export const ROTATION_SNAP_STEP_DEGREES = 15;
export const ROTATION_SNAP_TOLERANCE_DEGREES = 6;

export function getRotationSnapAngles(enabled: boolean, step = ROTATION_SNAP_STEP_DEGREES) {
  if (!enabled || step <= 0) {
    return [];
  }

  const snapCount = Math.floor(360 / step);
  return Array.from({ length: snapCount }, (_unused, index) => index * step);
}
