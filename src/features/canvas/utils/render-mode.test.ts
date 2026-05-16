import { describe, expect, it } from "vitest";

import type { ImageAssetItem, TextAssetItem } from "@/domain/assets/types";

import {
  getCanvasImagePreloadSources,
  getCanvasRenderMode,
  shouldUseCanvasPreviewImage,
} from "./render-mode";

const imageAsset: ImageAssetItem = {
  id: "image-1",
  kind: "imported",
  imagePath: "/tmp/image.png",
  thumbnailPath: "/tmp/image-thumb.jpg",
  sourceName: "image.png",
  width: 800,
  height: 600,
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
  zIndex: 1,
  locked: false,
  hidden: false,
  tags: [],
  createdAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z",
};

const textAsset: TextAssetItem = {
  id: "text-1",
  kind: "text",
  imagePath: "",
  text: {
    value: "note",
    fontFamily: "Inter",
    fontSize: 18,
    fontStyle: "normal",
    fill: "#ffffff",
    align: "left",
    lineHeight: 1.2,
  },
  thumbnailPath: null,
  sourceName: "Text",
  width: 200,
  height: 80,
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
  zIndex: 2,
  locked: false,
  hidden: false,
  tags: [],
  createdAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z",
};

describe("canvas render mode", () => {
  it("uses interactive rendering while camera or canvas activity is settling", () => {
    expect(getCanvasRenderMode({
      isCameraRenderSettling: false,
      isInteractionRenderSettling: false,
      hasMarqueeSession: false,
    })).toBe("settled");

    expect(getCanvasRenderMode({
      isCameraRenderSettling: true,
      isInteractionRenderSettling: false,
      hasMarqueeSession: false,
    })).toBe("interactive");

    expect(getCanvasRenderMode({
      isCameraRenderSettling: false,
      isInteractionRenderSettling: false,
      hasMarqueeSession: true,
    })).toBe("interactive");
  });

  it("uses image thumbnails for interactive rendering and small settled images", () => {
    expect(shouldUseCanvasPreviewImage(imageAsset, "interactive")).toBe(true);
    expect(shouldUseCanvasPreviewImage(imageAsset, "settled")).toBe(false);
    expect(shouldUseCanvasPreviewImage(imageAsset, "settled", 1024)).toBe(true);
    expect(shouldUseCanvasPreviewImage(imageAsset, "settled", 1025)).toBe(false);
    expect(shouldUseCanvasPreviewImage({ ...imageAsset, thumbnailPath: null }, "interactive")).toBe(false);
    expect(shouldUseCanvasPreviewImage(textAsset, "interactive")).toBe(false);
  });

  it("keeps moderately scaled 4k images on thumbnails instead of loading originals", () => {
    const fourKAsset: ImageAssetItem = {
      ...imageAsset,
      width: 2160,
      height: 3840,
      scale: 0.094,
    };
    const renderedMaxDimension = fourKAsset.height * fourKAsset.scale * 1.7;

    expect(Math.round(renderedMaxDimension)).toBe(614);
    expect(shouldUseCanvasPreviewImage(fourKAsset, "settled", renderedMaxDimension)).toBe(true);
    expect(getCanvasImagePreloadSources({
      asset: fourKAsset,
      renderMode: "settled",
      renderedMaxDimension,
      intersectsRenderViewport: true,
      isPinned: false,
    })).toEqual(["/tmp/image-thumb.jpg"]);
  });

  it("preloads full-size images only when they are actually rendered", () => {
    expect(getCanvasImagePreloadSources({
      asset: imageAsset,
      renderMode: "settled",
      renderedMaxDimension: 2000,
      intersectsRenderViewport: false,
      isPinned: false,
    })).toEqual(["/tmp/image-thumb.jpg"]);

    expect(getCanvasImagePreloadSources({
      asset: imageAsset,
      renderMode: "settled",
      renderedMaxDimension: 2000,
      intersectsRenderViewport: true,
      isPinned: false,
    })).toEqual(["/tmp/image-thumb.jpg", "/tmp/image.png"]);

    expect(getCanvasImagePreloadSources({
      asset: { ...imageAsset, thumbnailPath: null },
      renderMode: "interactive",
      renderedMaxDimension: 2000,
      intersectsRenderViewport: true,
      isPinned: false,
    })).toEqual(["/tmp/image.png"]);
  });
});
