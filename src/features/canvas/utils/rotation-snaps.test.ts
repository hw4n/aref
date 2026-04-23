import { describe, expect, it } from "vitest";

import {
  ROTATION_SNAP_STEP_DEGREES,
  getRotationSnapAngles,
} from "./rotation-snaps";

describe("rotation snaps", () => {
  it("returns no snap angles when snapping is disabled", () => {
    expect(getRotationSnapAngles(false)).toEqual([]);
  });

  it("returns 15-degree snap angles around the full circle", () => {
    const snaps = getRotationSnapAngles(true);

    expect(snaps).toHaveLength(360 / ROTATION_SNAP_STEP_DEGREES);
    expect(snaps[0]).toBe(0);
    expect(snaps[1]).toBe(15);
    expect(snaps.at(-1)).toBe(345);
  });
});
