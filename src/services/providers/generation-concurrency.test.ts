import { describe, expect, it } from "vitest";

import type { GenerationImageSize } from "@/domain/jobs/types";
import type { GenerationProviderInvocation } from "@/domain/providers/types";

import {
  getGenerationConcurrencyPlan,
  mapWithConcurrency,
  WeightedSemaphore,
} from "./generation-concurrency";

function invocation(provider: string, size: GenerationImageSize, referenceCount: number): GenerationProviderInvocation {
  return {
    jobId: `job-${provider}`,
    request: {
      selectedAssetIds: [],
      prompt: "prompt",
      provider,
      model: provider,
      settings: {
        imageCount: 1,
        size,
        quality: "auto",
        moderation: "low",
      },
    },
    referenceAssets: Array.from({ length: referenceCount }, (_, index) => ({
      id: `asset-${index + 1}`,
      kind: "imported",
      imagePath: `/tmp/ref-${index + 1}.png`,
      sourceName: `ref-${index + 1}.png`,
      thumbnailPath: null,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      zIndex: index,
      locked: false,
      hidden: false,
      tags: [],
      createdAt: "2026-05-13T00:00:00.000Z",
      updatedAt: "2026-05-13T00:00:00.000Z",
    })),
  };
}

describe("generation concurrency", () => {
  it("classifies heavy oauth generations as exclusive two-permit work", () => {
    expect(getGenerationConcurrencyPlan(invocation("ima2-sidecar", "1024x1024", 0))).toMatchObject({
      capacity: 2,
      permits: 1,
      isHeavy: false,
    });
    expect(getGenerationConcurrencyPlan(invocation("ima2-sidecar", "3840x2160", 0))).toMatchObject({
      capacity: 2,
      permits: 2,
      isHeavy: true,
    });
  });

  it("lets two light semaphore tasks run before a third waits", async () => {
    const semaphore = new WeightedSemaphore(2);
    const signal = new AbortController().signal;
    const releaseFirst = await semaphore.acquire(1, signal);
    const releaseSecond = await semaphore.acquire(1, signal);
    let thirdAcquired = false;
    const third = semaphore.acquire(1, signal).then((release) => {
      thirdAcquired = true;
      return release;
    });

    await Promise.resolve();
    expect(thirdAcquired).toBe(false);

    releaseFirst();
    const releaseThird = await third;
    expect(thirdAcquired).toBe(true);

    releaseSecond();
    releaseThird();
  });

  it("rejects queued semaphore work when it is aborted", async () => {
    const semaphore = new WeightedSemaphore(1);
    const release = await semaphore.acquire(1, new AbortController().signal);
    const controller = new AbortController();
    const pending = semaphore.acquire(1, controller.signal);

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    release();
  });

  it("caps parallel reference workers while preserving result order", async () => {
    const controller = new AbortController();
    let active = 0;
    let maxActive = 0;

    const results = await mapWithConcurrency([1, 2, 3, 4], 2, controller.signal, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return item * 10;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(results).toEqual([10, 20, 30, 40]);
  });
});
