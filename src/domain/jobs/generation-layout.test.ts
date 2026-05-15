import { describe, expect, it } from "vitest";

import { rectsIntersect } from "@/domain/shared/geometry";

import {
  computeBulkGenerationPlacements,
  getGenerationRequestPlaceholderBounds,
} from "./generation-layout";
import type { GenerationRequest } from "./types";

const request: GenerationRequest = {
  selectedAssetIds: [],
  prompt: "Generate a reference sheet",
  provider: "mock",
  model: "mock-canvas-v1",
  settings: {
    imageCount: 1,
    size: "1024x1024",
    quality: "medium",
    moderation: "low",
  },
};

describe("generation layout", () => {
  it("places bulk generation jobs in a non-overlapping grid", () => {
    const placements = computeBulkGenerationPlacements(request, 8, 8, { x: 0, y: 0 });
    const bounds = placements.map((placement) => getGenerationRequestPlaceholderBounds(request, placement));

    expect(placements).toHaveLength(64);
    for (let index = 0; index < bounds.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < bounds.length; otherIndex += 1) {
        expect(rectsIntersect(bounds[index]!, bounds[otherIndex]!)).toBe(false);
      }
    }
  });
});
