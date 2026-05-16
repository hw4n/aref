import { describe, expect, it } from "vitest";

import { getVirtualWindowRange } from "./virtual-list";

describe("getVirtualWindowRange", () => {
  it("limits rendered items to the visible window plus overscan", () => {
    const range = getVirtualWindowRange({
      gap: 8,
      itemCount: 500,
      itemHeight: 64,
      overscan: 4,
      scrollTop: 0,
      viewportHeight: 512,
    });

    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBe(16);
    expect(range.totalHeight).toBe(35_992);
  });

  it("moves the window by scroll position without rendering preceding items", () => {
    const range = getVirtualWindowRange({
      gap: 8,
      itemCount: 500,
      itemHeight: 64,
      overscan: 4,
      scrollTop: 7_200,
      viewportHeight: 512,
    });

    expect(range.startIndex).toBe(96);
    expect(range.endIndex).toBe(112);
    expect(range.offsetTop).toBe(6_912);
  });
});
