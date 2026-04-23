import { describe, expect, it } from "vitest";

import type { AssetItem } from "@/domain/assets/types";

import {
  bringSelectionForward,
  bringSelectionToFront,
  sendSelectionBackward,
  sendSelectionToBack,
} from "./asset-order";

function createAsset(id: string, zIndex: number): AssetItem {
  return {
    id,
    kind: "imported",
    imagePath: `${id}.png`,
    thumbnailPath: null,
    width: 100,
    height: 100,
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    zIndex,
    locked: false,
    hidden: false,
    tags: [],
    createdAt: "2026-04-23T00:00:00.000Z",
    updatedAt: "2026-04-23T00:00:00.000Z",
  };
}

function orderedIds(assets: Record<string, AssetItem>) {
  return Object.values(assets)
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((asset) => asset.id);
}

describe("asset z-order helpers", () => {
  const baseAssets = {
    a: createAsset("a", 0),
    b: createAsset("b", 1),
    c: createAsset("c", 2),
    d: createAsset("d", 3),
  };

  it("moves a selection one step forward", () => {
    const nextAssets = bringSelectionForward(baseAssets, ["b"], "2026-04-23T01:00:00.000Z");
    expect(orderedIds(nextAssets)).toEqual(["a", "c", "b", "d"]);
  });

  it("moves a selection one step backward", () => {
    const nextAssets = sendSelectionBackward(baseAssets, ["c"], "2026-04-23T01:00:00.000Z");
    expect(orderedIds(nextAssets)).toEqual(["a", "c", "b", "d"]);
  });

  it("moves a multi-selection to front while preserving relative order", () => {
    const nextAssets = bringSelectionToFront(baseAssets, ["a", "c"], "2026-04-23T01:00:00.000Z");
    expect(orderedIds(nextAssets)).toEqual(["b", "d", "a", "c"]);
  });

  it("moves a multi-selection to back while preserving relative order", () => {
    const nextAssets = sendSelectionToBack(baseAssets, ["b", "d"], "2026-04-23T01:00:00.000Z");
    expect(orderedIds(nextAssets)).toEqual(["b", "d", "a", "c"]);
  });
});
