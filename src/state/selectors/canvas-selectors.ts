import type { AssetItem } from "@/domain/assets/types";
import { getSelectedGroupIds } from "@/domain/groups/group-utils";
import type { GroupItem } from "@/domain/groups/types";
import type { GenerationJob } from "@/domain/jobs/types";
import type { AppStoreState } from "@/state/app-store";

function createAssetsMemo<T>(selector: (assets: AppStoreState["project"]["assets"]) => T) {
  let previousAssets: AppStoreState["project"]["assets"] | null = null;
  let previousValue: T | null = null;

  return (assets: AppStoreState["project"]["assets"]) => {
    if (assets === previousAssets && previousValue !== null) {
      return previousValue;
    }

    previousAssets = assets;
    previousValue = selector(assets);
    return previousValue;
  };
}

function createJobsMemo<T>(selector: (jobs: AppStoreState["project"]["jobs"]) => T) {
  let previousJobs: AppStoreState["project"]["jobs"] | null = null;
  let previousValue: T | null = null;

  return (jobs: AppStoreState["project"]["jobs"]) => {
    if (jobs === previousJobs && previousValue !== null) {
      return previousValue;
    }

    previousJobs = jobs;
    previousValue = selector(jobs);
    return previousValue;
  };
}

const selectSortedVisibleAssetsFromMap = createAssetsMemo((assets) =>
  Object.values(assets)
    .filter((asset) => !asset.hidden)
    .sort((left, right) => left.zIndex - right.zIndex),
);

const selectSortedAssetsFromMap = createAssetsMemo((assets) =>
  Object.values(assets)
    .sort((left, right) => right.zIndex - left.zIndex),
);

const selectHiddenAssetsFromMap = createAssetsMemo((assets) =>
  Object.values(assets)
    .filter((asset) => asset.hidden)
    .sort((left, right) => right.zIndex - left.zIndex),
);

const selectHiddenAssetCountFromMap = createAssetsMemo((assets) =>
  Object.values(assets).filter((asset) => asset.hidden).length,
);

const selectSortedGenerationJobsFromMap = createJobsMemo((jobs) =>
  Object.values(jobs).sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  ),
);

const selectActiveGenerationJobsFromMap = createJobsMemo((jobs) =>
  Object.values(jobs)
    .filter((job) => job.status === "queued" || job.status === "running")
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)),
);

let previousSelectedAssetsInput:
  | {
    assets: AppStoreState["project"]["assets"];
    assetIds: string[];
    value: AssetItem[];
  }
  | null = null;

let previousSelectedGroupsInput:
  | {
    groups: AppStoreState["project"]["groups"];
    assetIds: string[];
    value: GroupItem[];
  }
  | null = null;

export function selectSortedVisibleAssets(state: AppStoreState): AssetItem[] {
  return selectSortedVisibleAssetsFromMap(state.project.assets);
}

export function selectSortedAssets(state: AppStoreState): AssetItem[] {
  return selectSortedAssetsFromMap(state.project.assets);
}

export function selectSelectedAssetIds(state: AppStoreState): string[] {
  return state.project.selection.assetIds;
}

export function selectSelectedAssets(state: AppStoreState): AssetItem[] {
  if (
    previousSelectedAssetsInput
    && previousSelectedAssetsInput.assets === state.project.assets
    && previousSelectedAssetsInput.assetIds === state.project.selection.assetIds
  ) {
    return previousSelectedAssetsInput.value;
  }

  const value = state.project.selection.assetIds
    .map((assetId) => state.project.assets[assetId])
    .filter(Boolean);
  previousSelectedAssetsInput = {
    assets: state.project.assets,
    assetIds: state.project.selection.assetIds,
    value,
  };
  return value;
}

export function selectHiddenAssets(state: AppStoreState): AssetItem[] {
  return selectHiddenAssetsFromMap(state.project.assets);
}

export function selectHiddenAssetCount(state: AppStoreState): number {
  return selectHiddenAssetCountFromMap(state.project.assets);
}

export function selectSelectedGroups(state: AppStoreState): GroupItem[] {
  if (
    previousSelectedGroupsInput
    && previousSelectedGroupsInput.groups === state.project.groups
    && previousSelectedGroupsInput.assetIds === state.project.selection.assetIds
  ) {
    return previousSelectedGroupsInput.value;
  }

  const groupIds = getSelectedGroupIds(state.project.groups, state.project.selection.assetIds);
  const value = groupIds
    .map((groupId) => state.project.groups[groupId])
    .filter(Boolean);
  previousSelectedGroupsInput = {
    groups: state.project.groups,
    assetIds: state.project.selection.assetIds,
    value,
  };
  return value;
}

export function selectSortedGenerationJobs(state: AppStoreState): GenerationJob[] {
  return selectSortedGenerationJobsFromMap(state.project.jobs);
}

export function selectActiveGenerationJobs(state: AppStoreState): GenerationJob[] {
  return selectActiveGenerationJobsFromMap(state.project.jobs);
}
