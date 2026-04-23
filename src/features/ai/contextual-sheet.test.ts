import { describe, expect, it } from "vitest";

import { shouldShowContextualGenerationSheet } from "@/features/ai/contextual-sheet";

describe("shouldShowContextualGenerationSheet", () => {
  it("opens the sheet when selection exists", () => {
    expect(shouldShowContextualGenerationSheet(2, false)).toBe(true);
  });

  it("opens the sheet when explicitly invoked from blank canvas", () => {
    expect(shouldShowContextualGenerationSheet(0, true)).toBe(true);
  });

  it("stays hidden when nothing is selected and no explicit open exists", () => {
    expect(shouldShowContextualGenerationSheet(0, false)).toBe(false);
  });
});
