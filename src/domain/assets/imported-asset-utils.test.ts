import { describe, expect, it } from "vitest";

import { createInitialCamera, resizeViewport } from "@/domain/camera/camera-math";

import { createImportedAssets } from "./imported-asset-utils";

describe("createImportedAssets", () => {
  it("creates imported assets near the viewport center with sequential z-index values", () => {
    const camera = resizeViewport(createInitialCamera(), 1200, 900);
    const existingAssets = {
      base: {
        id: "base",
        kind: "imported" as const,
        imagePath: "base://image",
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        rotation: 0,
        scale: 1,
        zIndex: 4,
        locked: false,
        hidden: false,
        tags: [],
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    };

    const assets = createImportedAssets(
      [
        {
          imagePath: "file://one",
          sourceName: "one.png",
          thumbnailPath: "file://one-thumb",
          width: 1600,
          height: 900,
        },
        {
          imagePath: "file://two",
          sourceName: "two.png",
          width: 900,
          height: 1200,
        },
      ],
      existingAssets,
      camera,
    );

    expect(assets).toHaveLength(2);
    expect(assets[0]?.zIndex).toBe(5);
    expect(assets[1]?.zIndex).toBe(6);
    expect(assets[0]?.scale).toBeLessThan(1);
    expect(assets[0]?.x).not.toBe(assets[1]?.x);
    expect(assets[0]?.sourceName).toBe("one.png");
    expect(assets[0]?.thumbnailPath).toBe("file://one-thumb");
    expect(assets[1]?.thumbnailPath).toBeNull();
  });
});
