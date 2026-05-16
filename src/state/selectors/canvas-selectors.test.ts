import { describe, expect, it } from "vitest";

import type { GenerationRequest } from "@/domain/jobs/types";
import { createSampleProject } from "@/domain/project/sample-project";
import { createAppStore } from "@/state/app-store";

import {
  selectActiveGenerationJobs,
  selectHiddenAssetCount,
  selectSelectedAssets,
  selectSortedAssets,
  selectSortedVisibleAssets,
} from "./canvas-selectors";

const sampleGenerationRequest: GenerationRequest = {
  selectedAssetIds: ["asset-forest"],
  prompt: "Generate a study",
  provider: "mock",
  model: "mock-canvas-v1",
  settings: {
    imageCount: 1,
    size: "1024x1024",
    quality: "medium",
    moderation: "low",
  },
};

function createSeededStore() {
  return createAppStore(createSampleProject());
}

describe("canvas selectors", () => {
  it("reuses sorted asset arrays when only the camera changes", () => {
    const store = createSeededStore();
    const visibleAssets = selectSortedVisibleAssets(store.getState());
    const sortedAssets = selectSortedAssets(store.getState());

    store.getState().setCameraPosition({ x: 120, y: -80 });

    expect(selectSortedVisibleAssets(store.getState())).toBe(visibleAssets);
    expect(selectSortedAssets(store.getState())).toBe(sortedAssets);
  });

  it("does not enumerate unchanged asset maps after the first selector read", () => {
    const store = createSeededStore();
    const state = store.getState();
    let ownKeysReadCount = 0;
    const trackedAssets = new Proxy(state.project.assets, {
      ownKeys(target) {
        ownKeysReadCount += 1;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, property) {
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });
    const trackedState = {
      ...state,
      project: {
        ...state.project,
        assets: trackedAssets,
      },
    };

    selectSortedVisibleAssets(trackedState);
    const readsAfterFirstCall = ownKeysReadCount;
    selectSortedVisibleAssets(trackedState);

    expect(readsAfterFirstCall).toBeGreaterThan(0);
    expect(ownKeysReadCount).toBe(readsAfterFirstCall);
  });

  it("reuses cached hidden counts when assets are unchanged", () => {
    const store = createSeededStore();
    const hiddenCount = selectHiddenAssetCount(store.getState());

    store.getState().setCameraPosition({ x: 30, y: 40 });

    expect(selectHiddenAssetCount(store.getState())).toBe(hiddenCount);
  });

  it("reuses selected asset arrays when the selection and assets are unchanged", () => {
    const store = createSeededStore();
    store.getState().selectAssets(["asset-forest", "asset-portrait"]);
    const selectedAssets = selectSelectedAssets(store.getState());

    store.getState().setCameraPosition({ x: -40, y: 90 });

    expect(selectSelectedAssets(store.getState())).toBe(selectedAssets);
  });

  it("reuses active job arrays when unrelated project fields change", () => {
    const store = createSeededStore();
    store.getState().queueGenerationJob(sampleGenerationRequest);
    const activeJobs = selectActiveGenerationJobs(store.getState());

    store.getState().setCameraPosition({ x: 18, y: 24 });

    expect(selectActiveGenerationJobs(store.getState())).toBe(activeJobs);
  });
});
