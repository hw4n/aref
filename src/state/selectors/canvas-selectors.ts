import type { AssetItem } from "@/domain/assets/types";
import { getSelectedGroupIds } from "@/domain/groups/group-utils";
import type { GroupItem } from "@/domain/groups/types";
import type { GenerationJob } from "@/domain/jobs/types";
import type { AppStoreState } from "@/state/app-store";

export function selectSortedVisibleAssets(state: AppStoreState): AssetItem[] {
  return Object.values(state.project.assets)
    .filter((asset) => !asset.hidden)
    .sort((left, right) => left.zIndex - right.zIndex);
}

export function selectSortedAssets(state: AppStoreState): AssetItem[] {
  return Object.values(state.project.assets)
    .sort((left, right) => right.zIndex - left.zIndex);
}

export function selectSelectedAssetIds(state: AppStoreState): string[] {
  return state.project.selection.assetIds;
}

export function selectSelectedAssets(state: AppStoreState): AssetItem[] {
  return state.project.selection.assetIds
    .map((assetId) => state.project.assets[assetId])
    .filter(Boolean);
}

export function selectHiddenAssets(state: AppStoreState): AssetItem[] {
  return Object.values(state.project.assets)
    .filter((asset) => asset.hidden)
    .sort((left, right) => right.zIndex - left.zIndex);
}

export function selectSelectedGroups(state: AppStoreState): GroupItem[] {
  const groupIds = getSelectedGroupIds(state.project.groups, state.project.selection.assetIds);
  return groupIds
    .map((groupId) => state.project.groups[groupId])
    .filter(Boolean);
}

export function selectSortedGenerationJobs(state: AppStoreState): GenerationJob[] {
  return Object.values(state.project.jobs).sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
}

export function selectActiveGenerationJobs(state: AppStoreState): GenerationJob[] {
  return Object.values(state.project.jobs)
    .filter((job) => job.status === "queued" || job.status === "running")
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}
