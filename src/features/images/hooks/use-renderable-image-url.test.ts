import { afterEach, describe, expect, it, vi } from "vitest";
import { convertFileSrc } from "@tauri-apps/api/core";
import { hasTauriRuntime } from "@/features/project/persistence/tauri-runtime";
import { readManagedImageBytes } from "@/features/project/persistence/project-io";

import { loadRenderableImageElement, resolveRenderableImageUrl } from "./use-renderable-image-url";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${encodeURIComponent(filePath)}`),
  isTauri: vi.fn(() => false),
}));

vi.mock("@/features/project/persistence/tauri-runtime", () => ({
  hasTauriRuntime: vi.fn(() => false),
}));

vi.mock("@/features/project/persistence/project-io", () => ({
  isLikelyFilePath: (value: string) => value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value),
  readManagedImageBytes: vi.fn(async () => [1, 2, 3]),
}));

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
  vi.mocked(hasTauriRuntime).mockReturnValue(false);
  vi.clearAllMocks();
});

describe("renderable image element loading", () => {
  it("uses Tauri asset URLs for local files without reading bytes through IPC", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);

    const url = await resolveRenderableImageUrl("C:\\images\\full.png");

    expect(url).toBe("asset://localhost/C%3A%5Cimages%5Cfull.png");
    expect(convertFileSrc).toHaveBeenCalledWith("C:\\images\\full.png");
    expect(readManagedImageBytes).not.toHaveBeenCalled();
  });

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
