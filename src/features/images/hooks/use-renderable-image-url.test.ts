import { afterEach, describe, expect, it, vi } from "vitest";

import { loadRenderableImageElement } from "./use-renderable-image-url";

const originalImage = window.Image;

function installImageLoadStub() {
  const startedSources: string[] = [];
  const pendingLoads: Array<{ source: string; complete: () => void }> = [];

  class TestImage {
    crossOrigin: string | null = null;
    decoding: "async" | "sync" | "auto" = "auto";
    naturalWidth = 3840;
    naturalHeight = 2160;
    width = 3840;
    height = 2160;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private source = "";

    set src(value: string) {
      this.source = value;
      startedSources.push(value);
      pendingLoads.push({
        source: value,
        complete: () => this.onload?.(),
      });
    }

    get src() {
      return this.source;
    }
  }

  Object.defineProperty(window, "Image", {
    configurable: true,
    writable: true,
    value: TestImage as unknown as typeof Image,
  });

  return {
    pendingLoads,
    startedSources,
  };
}

async function completeRemainingLoads(
  pendingLoads: Array<{ complete: () => void }>,
  startedSources: string[],
  expectedStartedCount: number,
) {
  while (startedSources.length < expectedStartedCount || pendingLoads.length > 0) {
    if (pendingLoads.length === 0) {
      await vi.waitFor(() => expect(pendingLoads.length).toBeGreaterThan(0));
    }

    pendingLoads.shift()?.complete();
    await Promise.resolve();
  }
}

afterEach(() => {
  Object.defineProperty(window, "Image", {
    configurable: true,
    writable: true,
    value: originalImage,
  });
});

describe("renderable image element loading", () => {
  it("limits concurrent image element loads", async () => {
    const { pendingLoads, startedSources } = installImageLoadStub();
    const sources = Array.from({ length: 5 }, (_unused, index) => `concurrent-${index}.png`);
    const loads = sources.map((source) => loadRenderableImageElement(source));

    await vi.waitFor(() => expect(startedSources).toHaveLength(3));
    expect(startedSources).toEqual(sources.slice(0, 3));

    pendingLoads.shift()?.complete();
    await vi.waitFor(() => expect(startedSources).toHaveLength(4));

    pendingLoads.shift()?.complete();
    await vi.waitFor(() => expect(startedSources).toHaveLength(5));

    await completeRemainingLoads(pendingLoads, startedSources, sources.length);
    await Promise.all(loads);
  });

  it("starts visible image loads before queued preloads", async () => {
    const { pendingLoads, startedSources } = installImageLoadStub();
    const preloadSources = Array.from({ length: 5 }, (_unused, index) => `preload-${index}.png`);
    const preloadLoads = preloadSources.map((source) =>
      loadRenderableImageElement(source, { priority: "preload" }),
    );

    await vi.waitFor(() => expect(startedSources).toHaveLength(3));

    const visibleLoad = loadRenderableImageElement("visible.png");
    pendingLoads.shift()?.complete();

    await vi.waitFor(() => expect(startedSources).toHaveLength(4));
    expect(startedSources[3]).toBe("visible.png");

    await completeRemainingLoads(pendingLoads, startedSources, preloadSources.length + 1);
    await Promise.all([...preloadLoads, visibleLoad]);
  });
});
