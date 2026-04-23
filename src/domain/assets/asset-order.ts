import type { AssetItem } from "@/domain/assets/types";

function sortAssetIdsByZIndex(assets: Record<string, AssetItem>) {
  return Object.values(assets)
    .sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id))
    .map((asset) => asset.id);
}

function applyOrderedIds(
  assets: Record<string, AssetItem>,
  orderedIds: string[],
  timestamp: string,
) {
  const nextAssets: Record<string, AssetItem> = { ...assets };
  let didChange = false;

  orderedIds.forEach((assetId, zIndex) => {
    const asset = nextAssets[assetId];

    if (!asset) {
      return;
    }

    if (asset.zIndex === zIndex) {
      return;
    }

    nextAssets[assetId] = {
      ...asset,
      zIndex,
      updatedAt: timestamp,
    };
    didChange = true;
  });

  return didChange ? nextAssets : assets;
}

function moveSelectionByOneStep(
  orderedIds: string[],
  selectedIds: Set<string>,
  direction: "forward" | "backward",
) {
  const nextIds = [...orderedIds];

  if (direction === "forward") {
    for (let index = nextIds.length - 2; index >= 0; index -= 1) {
      if (!selectedIds.has(nextIds[index]!) || selectedIds.has(nextIds[index + 1]!)) {
        continue;
      }

      [nextIds[index], nextIds[index + 1]] = [nextIds[index + 1]!, nextIds[index]!];
    }

    return nextIds;
  }

  for (let index = 1; index < nextIds.length; index += 1) {
    if (!selectedIds.has(nextIds[index]!) || selectedIds.has(nextIds[index - 1]!)) {
      continue;
    }

    [nextIds[index], nextIds[index - 1]] = [nextIds[index - 1]!, nextIds[index]!];
  }

  return nextIds;
}

function moveSelectionToEdge(
  orderedIds: string[],
  selectedIds: Set<string>,
  direction: "front" | "back",
) {
  const selected = orderedIds.filter((assetId) => selectedIds.has(assetId));
  const unselected = orderedIds.filter((assetId) => !selectedIds.has(assetId));

  return direction === "front"
    ? [...unselected, ...selected]
    : [...selected, ...unselected];
}

export function bringSelectionForward(
  assets: Record<string, AssetItem>,
  selectedAssetIds: string[],
  timestamp: string,
) {
  if (selectedAssetIds.length === 0) {
    return assets;
  }

  return applyOrderedIds(
    assets,
    moveSelectionByOneStep(sortAssetIdsByZIndex(assets), new Set(selectedAssetIds), "forward"),
    timestamp,
  );
}

export function sendSelectionBackward(
  assets: Record<string, AssetItem>,
  selectedAssetIds: string[],
  timestamp: string,
) {
  if (selectedAssetIds.length === 0) {
    return assets;
  }

  return applyOrderedIds(
    assets,
    moveSelectionByOneStep(sortAssetIdsByZIndex(assets), new Set(selectedAssetIds), "backward"),
    timestamp,
  );
}

export function bringSelectionToFront(
  assets: Record<string, AssetItem>,
  selectedAssetIds: string[],
  timestamp: string,
) {
  if (selectedAssetIds.length === 0) {
    return assets;
  }

  return applyOrderedIds(
    assets,
    moveSelectionToEdge(sortAssetIdsByZIndex(assets), new Set(selectedAssetIds), "front"),
    timestamp,
  );
}

export function sendSelectionToBack(
  assets: Record<string, AssetItem>,
  selectedAssetIds: string[],
  timestamp: string,
) {
  if (selectedAssetIds.length === 0) {
    return assets;
  }

  return applyOrderedIds(
    assets,
    moveSelectionToEdge(sortAssetIdsByZIndex(assets), new Set(selectedAssetIds), "back"),
    timestamp,
  );
}
