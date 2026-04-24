import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AssetItem } from "@/domain/assets/types";
import { readManagedImageBytes } from "@/features/project/persistence/project-io";

import { AssetThumbnail } from "./AssetThumbnail";

vi.mock("@/features/project/persistence/project-io", async () => {
  const actual = await vi.importActual<typeof import("@/features/project/persistence/project-io")>(
    "@/features/project/persistence/project-io",
  );

  return {
    ...actual,
    createManagedImageThumbnail: vi.fn(),
    readManagedImageBytes: vi.fn(),
  };
});

vi.mock("@/features/project/persistence/tauri-runtime", () => ({
  hasTauriRuntime: () => true,
}));

const baseAsset: AssetItem = {
  id: "asset-1",
  kind: "imported",
  imagePath: "C:\\images\\large-reference.png",
  sourceName: "large-reference.png",
  thumbnailPath: null,
  width: 2048,
  height: 2048,
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
  zIndex: 0,
  locked: false,
  hidden: false,
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("AssetThumbnail", () => {
  it("does not read managed original image bytes during initial render", () => {
    render(<AssetThumbnail asset={baseAsset} />);

    expect(readManagedImageBytes).not.toHaveBeenCalled();
    expect(screen.getByText("L")).toBeInTheDocument();
  });
});
