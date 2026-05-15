import { describe, expect, it } from "vitest";

import {
  GENERATION_DRAFT_STORAGE_KEY,
  loadGenerationDraft,
  normalizeGenerationDraft,
  saveGenerationDraft,
} from "./generation-draft-storage";

describe("generation draft storage", () => {
  it("persists prompt and image generation settings", () => {
    const memoryStorage = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memoryStorage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memoryStorage.set(key, value);
      },
    };

    saveGenerationDraft(
      {
        prompt: "A precise product render",
        negativePrompt: "blur",
        provider: "openai",
        model: "gpt-image-2",
        settings: {
          imageCount: 2,
          size: "2048x1152",
          quality: "high",
          moderation: "auto",
          compressReferenceImages: false,
        },
        bulkGrid: {
          columns: 3,
          rows: 2,
        },
        pinnedAssetIds: ["asset-1"],
        isExplicitlyOpened: true,
      },
      storage,
    );

    const rawValue = JSON.parse(memoryStorage.get(GENERATION_DRAFT_STORAGE_KEY) ?? "{}");
    expect(rawValue.pinnedAssetIds).toBeUndefined();
    expect(rawValue.isExplicitlyOpened).toBeUndefined();
    expect(loadGenerationDraft(storage)).toMatchObject({
      prompt: "A precise product render",
      negativePrompt: "blur",
      provider: "openai",
      model: "gpt-image-2",
      bulkGrid: {
        columns: 3,
        rows: 2,
      },
      settings: {
        imageCount: 2,
        size: "2048x1152",
        quality: "high",
        moderation: "auto",
        compressReferenceImages: false,
      },
    });
  });

  it("migrates legacy aspect ratio settings into size", () => {
    expect(
      normalizeGenerationDraft({
        settings: {
          imageCount: 1,
          aspectRatio: "16:9",
          quality: "medium",
          moderation: "low",
        },
      }).settings,
    ).toMatchObject({
      size: "2048x1152",
      quality: "medium",
      compressReferenceImages: true,
    });
  });

  it("normalizes invalid bulk grid values", () => {
    expect(
      normalizeGenerationDraft({
        bulkGrid: {
          columns: 12,
          rows: -2,
        },
      }).bulkGrid,
    ).toEqual({
      columns: 4,
      rows: 1,
    });
  });
});
