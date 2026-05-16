import { invoke } from "@tauri-apps/api/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createManagedImageThumbnail } from "./project-io";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("./tauri-runtime", () => ({
  hasTauriRuntime: () => true,
}));

vi.mock("@/features/images/utils/image-thumbnail", () => ({
  createImageThumbnailBlob: vi.fn(async () => new Blob([new Uint8Array([9, 8, 7])])),
  getThumbnailFileName: vi.fn(() => "thumbnail.jpg"),
  loadImageElement: vi.fn(async () => new Image()),
}));

function installObjectUrlStub() {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob://thumbnail-source"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });

  return () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
  };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("project image IO", () => {
  it("limits managed thumbnail backfill to one original image read at a time", async () => {
    const restoreObjectUrl = installObjectUrlStub();
    const readResolvers: Array<() => void> = [];
    let thumbnailIndex = 0;

    try {
      vi.mocked(invoke).mockImplementation((command) => {
        if (command === "read_image_bytes") {
          return new Promise((resolve) => {
            readResolvers.push(() => resolve([1, 2, 3, 4]));
          });
        }

        if (command === "ingest_image_asset") {
          thumbnailIndex += 1;
          return Promise.resolve(`C:\\thumbs\\thumbnail-${thumbnailIndex}.jpg`);
        }

        return Promise.resolve(null);
      });

      const first = createManagedImageThumbnail({
        imagePath: "C:\\images\\first.png",
        sourceName: "first.png",
      });
      const second = createManagedImageThumbnail({
        imagePath: "C:\\images\\second.png",
        sourceName: "second.png",
      });

      await vi.waitFor(() => expect(readResolvers).toHaveLength(1));
      expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "read_image_bytes")).toHaveLength(1);

      readResolvers.shift()?.();
      await first;

      await vi.waitFor(() => expect(readResolvers).toHaveLength(1));
      expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "read_image_bytes")).toHaveLength(2);

      readResolvers.shift()?.();
      await second;
    } finally {
      restoreObjectUrl();
    }
  });
});
