import type { GroupItem } from "@/domain/groups/types";

function normalizeGroupMembers(assetIds: string[]) {
  return Array.from(new Set(assetIds));
}

export function syncGroupsWithAssets(
  groups: Record<string, GroupItem>,
  lockedAssetIds: Set<string>,
  hiddenAssetIds: Set<string>,
) {
  return Object.fromEntries(
    Object.values(groups)
      .map((group) => {
        const assetIds = normalizeGroupMembers(group.assetIds);

        if (assetIds.length < 2) {
          return null;
        }

        return [
          group.id,
          {
            ...group,
            assetIds,
            locked: assetIds.every((assetId) => lockedAssetIds.has(assetId)),
            hidden: assetIds.every((assetId) => hiddenAssetIds.has(assetId)),
          },
        ] as const;
      })
      .filter((entry): entry is readonly [string, GroupItem] => Boolean(entry)),
  );
}

export function createGroupFromSelection(
  groups: Record<string, GroupItem>,
  selectedAssetIds: string[],
) {
  const normalizedAssetIds = normalizeGroupMembers(selectedAssetIds);

  if (normalizedAssetIds.length < 2) {
    return groups;
  }

  const nextGroups = removeAssetIdsFromGroups(groups, normalizedAssetIds);
  const nextGroupNumber = Object.keys(nextGroups).length + 1;
  const nextGroup: GroupItem = {
    id: crypto.randomUUID(),
    name: `Group ${nextGroupNumber}`,
    assetIds: normalizedAssetIds,
    locked: false,
    hidden: false,
  };

  return {
    ...nextGroups,
    [nextGroup.id]: nextGroup,
  };
}

export function removeAssetIdsFromGroups(
  groups: Record<string, GroupItem>,
  assetIds: string[],
) {
  const removalSet = new Set(assetIds);

  return Object.fromEntries(
    Object.values(groups)
      .map((group) => {
        const nextAssetIds = group.assetIds.filter((assetId) => !removalSet.has(assetId));

        if (nextAssetIds.length < 2) {
          return null;
        }

        return [
          group.id,
          {
            ...group,
            assetIds: nextAssetIds,
          },
        ] as const;
      })
      .filter((entry): entry is readonly [string, GroupItem] => Boolean(entry)),
  );
}

export function ungroupSelection(
  groups: Record<string, GroupItem>,
  selectedAssetIds: string[],
) {
  const selectedIds = new Set(selectedAssetIds);

  return Object.fromEntries(
    Object.values(groups)
      .filter((group) => !group.assetIds.every((assetId) => selectedIds.has(assetId)))
      .map((group) => [group.id, group] as const),
  );
}

export function getSelectedGroupIds(
  groups: Record<string, GroupItem>,
  selectedAssetIds: string[],
) {
  const selectedIds = new Set(selectedAssetIds);

  return Object.values(groups)
    .filter((group) => group.assetIds.every((assetId) => selectedIds.has(assetId)))
    .map((group) => group.id);
}
