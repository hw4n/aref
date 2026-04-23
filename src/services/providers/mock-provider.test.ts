import { describe, expect, it, vi } from "vitest";

import type { GenerationProviderInvocation } from "@/domain/providers/types";

import { mockGenerationProvider } from "./mock-provider";

const baseInvocation: GenerationProviderInvocation = {
  jobId: "job-1",
  request: {
    selectedAssetIds: ["asset-forest"],
    prompt: "Generate a compact travel kit",
    provider: "mock",
    model: "mock-canvas-v1",
    settings: {
      imageCount: 2,
      aspectRatio: "1:1",
    },
  },
  referenceAssets: [],
};

describe("mock generation provider", () => {
  it("supports prompt-only generation with zero references", async () => {
    const result = await mockGenerationProvider.generateImages(
      {
        ...baseInvocation,
        request: {
          ...baseInvocation.request,
          selectedAssetIds: [],
        },
      },
      {
        signal: new AbortController().signal,
      },
    );

    expect(result.images).toHaveLength(2);
  });

  it("returns the requested number of mock outputs", async () => {
    const onStatusChange = vi.fn();
    const result = await mockGenerationProvider.generateImages(baseInvocation, {
      signal: new AbortController().signal,
      onStatusChange,
    });

    expect(onStatusChange).toHaveBeenCalledWith("running");
    expect(result.images).toHaveLength(2);
    expect(result.images[0]?.imagePath.startsWith("data:image/svg+xml")).toBe(true);
  });

  it("supports widescreen and portrait aspect ratios", async () => {
    const wideResult = await mockGenerationProvider.generateImages(
      {
        ...baseInvocation,
        request: {
          ...baseInvocation.request,
          settings: {
            imageCount: 1,
            aspectRatio: "16:9",
          },
        },
      },
      {
        signal: new AbortController().signal,
      },
    );

    const tallResult = await mockGenerationProvider.generateImages(
      {
        ...baseInvocation,
        request: {
          ...baseInvocation.request,
          settings: {
            imageCount: 1,
            aspectRatio: "9:16",
          },
        },
      },
      {
        signal: new AbortController().signal,
      },
    );

    expect(wideResult.images[0]).toMatchObject({
      width: 1600,
      height: 900,
    });
    expect(tallResult.images[0]).toMatchObject({
      width: 900,
      height: 1600,
    });
  });

  it("fails deterministically when the prompt requests failure", async () => {
    await expect(
      mockGenerationProvider.generateImages(
        {
          ...baseInvocation,
          request: {
            ...baseInvocation.request,
            prompt: "fail this mock job",
          },
        },
        {
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toThrow("Mock provider forced a failure");
  });

  it("supports cancellation through AbortSignal", async () => {
    const controller = new AbortController();
    const promise = mockGenerationProvider.generateImages(baseInvocation, {
      signal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
