import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AssetItem } from "@/domain/assets/types";
import {
  readManagedImageBytes,
  writeImageFilesToClipboard,
} from "@/features/project/persistence/project-io";
import { hasTauriRuntime } from "@/features/project/persistence/tauri-runtime";

import { copyAssetsToClipboard } from "./selection-clipboard";

vi.mock("@/features/project/persistence/tauri-runtime", () => ({
  hasTauriRuntime: vi.fn(),
}));

vi.mock("@/features/project/persistence/project-io", async () => {
  const actual = await vi.importActual<typeof import("@/features/project/persistence/project-io")>(
    "@/features/project/persistence/project-io",
  );

  return {
    ...actual,
    readManagedImageBytes: vi.fn(),
    writeImageFilesToClipboard: vi.fn(),
  };
});

const baseAsset: AssetItem = {
  id: "asset-1",
  kind: "imported",
  imagePath: "C:\\images\\large-reference.jpg",
  sourceName: "large-reference.jpg",
  thumbnailPath: null,
  width: 4032,
  height: 3024,
  x: 0,
  y: 0,
  rotation: 0,
  scale: 0.08,
  zIndex: 0,
  locked: false,
  hidden: false,
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("copyAssetsToClipboard", () => {
  const clipboardWrite = vi.fn();
  const drawImage = vi.fn();
  const revokeObjectUrl = vi.fn();
  const originalCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(writeImageFilesToClipboard).mockResolvedValue(1);
    vi.mocked(readManagedImageBytes).mockResolvedValue([1, 2, 3]);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: clipboardWrite,
      },
    });
    clipboardWrite.mockResolvedValue(undefined);

    vi.stubGlobal(
      "ClipboardItem",
      class ClipboardItem {
        constructor(public readonly items: Record<string, Blob>) {}
      },
    );
    vi.stubGlobal(
      "Image",
      class Image {
        crossOrigin = "";
        naturalWidth = 4032;
        naturalHeight = 3024;
        width = 4032;
        height = 3024;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:managed-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName !== "canvas") {
        return originalCreateElement(tagName);
      }

      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage,
          restore: vi.fn(),
          rotate: vi.fn(),
          save: vi.fn(),
          translate: vi.fn(),
        }),
        toBlob: (callback: BlobCallback) => callback(new Blob(["png"], { type: "image/png" })),
      } as unknown as HTMLCanvasElement;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("copies a single managed image as original-resolution image data for image editors", async () => {
    await expect(copyAssetsToClipboard([baseAsset])).resolves.toEqual({
      copiedCount: 1,
      mode: "single-image",
    });

    expect(readManagedImageBytes).toHaveBeenCalledWith("C:\\images\\large-reference.jpg");
    expect(drawImage).toHaveBeenCalledWith(expect.any(Object), 0, 0, 4032, 3024);
    expect(clipboardWrite).toHaveBeenCalledWith([expect.any(ClipboardItem)]);
    expect(writeImageFilesToClipboard).not.toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:managed-image");
  });

  it("copies multiple managed images as native files", async () => {
    vi.mocked(writeImageFilesToClipboard).mockResolvedValueOnce(2);
    const secondAsset = {
      ...baseAsset,
      id: "asset-2",
      imagePath: "C:\\images\\second-reference.png",
      sourceName: "second-reference.png",
      x: 500,
      zIndex: 1,
    };

    await expect(copyAssetsToClipboard([baseAsset, secondAsset])).resolves.toEqual({
      copiedCount: 2,
      mode: "files",
    });

    expect(writeImageFilesToClipboard).toHaveBeenCalledWith([
      {
        imagePath: "C:\\images\\large-reference.jpg",
        sourceName: "large-reference.jpg",
      },
      {
        imagePath: "C:\\images\\second-reference.png",
        sourceName: "second-reference.png",
      },
    ]);
    expect(clipboardWrite).not.toHaveBeenCalled();
  });
});
