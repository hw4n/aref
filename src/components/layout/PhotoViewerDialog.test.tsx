import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ImageAssetItem } from "@/domain/assets/types";

import { PhotoViewerDialog } from "./PhotoViewerDialog";

vi.mock("@/features/images/hooks/use-renderable-image-url", () => ({
  useRenderableImageUrl: (source: string) => `resolved:${source}`,
}));

function createImageAsset(partial: Partial<ImageAssetItem> = {}): ImageAssetItem {
  return {
    id: partial.id ?? "asset-1",
    kind: partial.kind ?? "imported",
    imagePath: partial.imagePath ?? "photo.png",
    sourceName: partial.sourceName ?? "photo.png",
    thumbnailPath: partial.thumbnailPath ?? null,
    width: partial.width ?? 1600,
    height: partial.height ?? 900,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    rotation: partial.rotation ?? 0,
    scale: partial.scale ?? 1,
    zIndex: partial.zIndex ?? 0,
    locked: partial.locked ?? false,
    hidden: partial.hidden ?? false,
    tags: partial.tags ?? [],
    createdAt: partial.createdAt ?? "2026-05-16T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-05-16T00:00:00.000Z",
    generation: partial.generation,
  };
}

function renderViewer(
  overrides: Partial<ComponentProps<typeof PhotoViewerDialog>> = {},
) {
  const assets = [
    createImageAsset({ id: "asset-1", imagePath: "one.png", sourceName: "one.png" }),
    createImageAsset({ id: "asset-2", imagePath: "two.png", sourceName: "two.png" }),
    createImageAsset({ id: "asset-3", imagePath: "three.png", sourceName: "three.png" }),
  ];
  const props: ComponentProps<typeof PhotoViewerDialog> = {
    asset: assets[1]!,
    assets,
    currentIndex: 1,
    totalCount: 3,
    hasPrevious: true,
    hasNext: true,
    canExport: true,
    isExporting: false,
    selectedAssetIds: [],
    onClose: vi.fn(),
    onExportSelected: vi.fn(),
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    onSelectIndex: vi.fn(),
    onToggleSelection: vi.fn(),
    ...overrides,
  };

  return {
    assets,
    props,
    ...render(<PhotoViewerDialog {...props} />),
  };
}

describe("PhotoViewerDialog", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders one active photo with position metadata", () => {
    const asset = createImageAsset({ id: "asset-1", imagePath: "one.png", sourceName: "one.png" });
    renderViewer({ asset });

    expect(screen.getByRole("dialog", { name: "one.png" })).toBeInTheDocument();
    expect(screen.getAllByText("2 / 3").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "one.png" }).getAttribute("src")).toBe("resolved:one.png");
  });

  it("supports button and keyboard navigation", () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const onClose = vi.fn();

    renderViewer({ onClose, onNext, onPrevious });

    fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onPrevious).toHaveBeenCalledTimes(2);
    expect(onNext).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a checkable file list and toggles the current photo with space", () => {
    const onToggleSelection = vi.fn();
    const onSelectIndex = vi.fn();

    renderViewer({
      selectedAssetIds: ["asset-2"],
      onSelectIndex,
      onToggleSelection,
    });

    expect(screen.getByRole("checkbox", { name: "Select one.png" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select two.png" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /three\.png/i }));
    fireEvent.keyDown(window, { code: "Space" });

    expect(onSelectIndex).toHaveBeenCalledWith(2);
    expect(onToggleSelection).toHaveBeenCalledWith("asset-2");
  });

  it("exports selected photos from the toolbar", () => {
    const onExportSelected = vi.fn();

    renderViewer({
      selectedAssetIds: ["asset-1", "asset-3"],
      onExportSelected,
    });

    fireEvent.click(screen.getByRole("button", { name: /Export selected \(2\)/i }));

    expect(onExportSelected).toHaveBeenCalledTimes(1);
  });
});
