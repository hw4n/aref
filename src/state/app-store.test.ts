import { describe, expect, it } from "vitest";

import type { GenerationRequest } from "@/domain/jobs/types";
import { createSampleProject } from "@/domain/project/sample-project";

import { createAppStore } from "./app-store";

function createSeededStore() {
  return createAppStore(createSampleProject());
}

const sampleGenerationRequest: GenerationRequest = {
  selectedAssetIds: ["asset-forest", "asset-portrait"],
  prompt: "Generate a weathered expedition backpack",
  negativePrompt: "plastic sheen",
  provider: "mock",
  model: "mock-canvas-v1",
  settings: {
    imageCount: 1,
    aspectRatio: "1:1",
  },
};

describe("app store", () => {
  it("starts with an empty board by default", () => {
    const store = createAppStore();

    expect(Object.keys(store.getState().project.assets)).toHaveLength(0);
    expect(store.getState().project.selection.assetIds).toEqual([]);
  });

  it("supports additive selection toggling", () => {
    const store = createSeededStore();

    store.getState().selectAsset("asset-forest");
    store.getState().selectAsset("asset-portrait", { additive: true });
    expect(store.getState().project.selection.assetIds).toEqual([
      "asset-forest",
      "asset-portrait",
    ]);

    store.getState().selectAsset("asset-forest", { additive: true });
    expect(store.getState().project.selection.assetIds).toEqual(["asset-portrait"]);
  });

  it("resets pinned refs and explicit generation sheet sessions when selection changes", () => {
    const store = createSeededStore();

    store.getState().selectAssets(["asset-forest", "asset-portrait"]);
    store.getState().setGenerationDraft({
      pinnedAssetIds: ["asset-forest"],
      isExplicitlyOpened: true,
    });

    store.getState().selectAsset("asset-lantern");

    expect(store.getState().project.selection.assetIds).toEqual(["asset-lantern"]);
    expect(store.getState().generationDraft.pinnedAssetIds).toBeNull();
    expect(store.getState().generationDraft.isExplicitlyOpened).toBe(false);
  });

  it("closes an explicitly opened prompt-only generation sheet when selection is cleared", () => {
    const store = createAppStore();

    store.getState().setGenerationDraft({
      isExplicitlyOpened: true,
    });
    store.getState().clearSelection();

    expect(store.getState().project.selection.assetIds).toEqual([]);
    expect(store.getState().generationDraft.isExplicitlyOpened).toBe(false);
  });

  it("updates asset positions through the domain store", () => {
    const store = createSeededStore();

    store.getState().setAssetPosition("asset-forest", { x: 120, y: -40 });

    expect(store.getState().project.assets["asset-forest"]).toMatchObject({
      x: 120,
      y: -40,
    });
  });

  it("updates multiple asset positions atomically through the domain store", () => {
    const store = createSeededStore();

    store.getState().setAssetPositions([
      { id: "asset-forest", position: { x: 120, y: -40 } },
      { id: "asset-portrait", position: { x: 240, y: 80 } },
    ]);

    expect(store.getState().project.assets["asset-forest"]).toMatchObject({
      x: 120,
      y: -40,
    });
    expect(store.getState().project.assets["asset-portrait"]).toMatchObject({
      x: 240,
      y: 80,
    });
  });

  it("duplicates and deletes the current selection", () => {
    const store = createSeededStore();

    store.getState().selectAsset("asset-forest");
    store.getState().duplicateSelection();

    const duplicatedIds = store.getState().project.selection.assetIds;
    expect(duplicatedIds).toHaveLength(1);
    expect(duplicatedIds[0]).not.toBe("asset-forest");
    expect(store.getState().project.assets[duplicatedIds[0]!]).toMatchObject({
      x: store.getState().project.assets["asset-forest"]!.x + 40,
      y: store.getState().project.assets["asset-forest"]!.y + 40,
    });

    store.getState().deleteSelection();
    expect(store.getState().project.assets[duplicatedIds[0]!]).toBeUndefined();
  });

  it("does not move locked assets and can toggle lock state", () => {
    const store = createSeededStore();

    store.getState().selectAsset("asset-forest");
    store.getState().toggleSelectedLocked();
    store.getState().setAssetPosition("asset-forest", { x: 999, y: 999 });

    expect(store.getState().project.assets["asset-forest"]).toMatchObject({
      locked: true,
      x: -420,
      y: -120,
    });

    store.getState().toggleSelectedLocked();
    store.getState().setAssetPosition("asset-forest", { x: 80, y: 120 });

    expect(store.getState().project.assets["asset-forest"]).toMatchObject({
      locked: false,
      x: 80,
      y: 120,
    });
  });

  it("hides and unhides the current selection without dropping selection state", () => {
    const store = createSeededStore();

    store.getState().selectAssets(["asset-forest", "asset-portrait"]);
    store.getState().hideSelected();
    expect(store.getState().project.assets["asset-forest"]?.hidden).toBe(true);
    expect(store.getState().project.assets["asset-portrait"]?.hidden).toBe(true);
    expect(store.getState().project.selection.assetIds).toEqual([
      "asset-forest",
      "asset-portrait",
    ]);

    store.getState().unhideSelected();
    expect(store.getState().project.assets["asset-forest"]?.hidden).toBe(false);
    expect(store.getState().project.assets["asset-portrait"]?.hidden).toBe(false);
  });

  it("can hide individual assets, reveal them, and center selection on reveal", () => {
    const store = createSeededStore();

    store.getState().setAssetHidden("asset-forest", true);
    expect(store.getState().project.assets["asset-forest"]?.hidden).toBe(true);

    store.getState().revealHiddenAsset("asset-forest");
    expect(store.getState().project.assets["asset-forest"]?.hidden).toBe(false);
    expect(store.getState().project.selection.assetIds).toEqual(["asset-forest"]);
    expect(store.getState().project.selection.lastActiveAssetId).toBe("asset-forest");
  });

  it("can unhide all hidden assets in bulk", () => {
    const store = createSeededStore();

    store.getState().setAssetHidden("asset-forest", true);
    store.getState().setAssetHidden("asset-portrait", true);
    store.getState().unhideAllHidden();

    expect(store.getState().project.assets["asset-forest"]?.hidden).toBe(false);
    expect(store.getState().project.assets["asset-portrait"]?.hidden).toBe(false);
  });

  it("supports undo and redo for visibility changes", () => {
    const store = createSeededStore();

    store.getState().selectAsset("asset-forest");
    store.getState().hideSelected();
    expect(store.getState().project.assets["asset-forest"]?.hidden).toBe(true);

    store.getState().undoVisibilityChange();
    expect(store.getState().project.assets["asset-forest"]?.hidden).toBe(false);

    store.getState().redoVisibilityChange();
    expect(store.getState().project.assets["asset-forest"]?.hidden).toBe(true);
  });

  it("keeps developer logs hidden unless developer mode is enabled", () => {
    const store = createAppStore();

    store.getState().setLogsVisible(true);
    expect(store.getState().uiPreferences.logsVisible).toBe(false);

    store.getState().setDeveloperMode(true);
    store.getState().setLogsVisible(true);
    expect(store.getState().uiPreferences.logsVisible).toBe(true);

    store.getState().setDeveloperMode(false);
    expect(store.getState().uiPreferences.logsVisible).toBe(false);
  });

  it("groups and ungroups a multi-selection", () => {
    const store = createSeededStore();

    store.getState().selectAssets(["asset-forest", "asset-portrait"]);
    store.getState().groupSelection();

    expect(Object.values(store.getState().project.groups)).toHaveLength(1);
    expect(Object.values(store.getState().project.groups)[0]?.assetIds).toEqual([
      "asset-forest",
      "asset-portrait",
    ]);

    store.getState().ungroupSelection();
    expect(Object.keys(store.getState().project.groups)).toHaveLength(0);
  });

  it("updates z-order for the current selection", () => {
    const store = createSeededStore();

    store.getState().selectAsset("asset-forest");
    store.getState().bringSelectionToFront();

    const orderedIds = Object.values(store.getState().project.assets)
      .sort((left, right) => left.zIndex - right.zIndex)
      .map((asset) => asset.id);

    expect(orderedIds.at(-1)).toBe("asset-forest");
  });

  it("imports real asset drafts and selects the imported assets", () => {
    const store = createAppStore();

    store.getState().importAssets([
      {
        imagePath: "blob://sunset",
        sourceName: "sunset.png",
        width: 2048,
        height: 1024,
      },
    ]);

    const [importedId] = store.getState().project.selection.assetIds;
    const importedAsset = importedId ? store.getState().project.assets[importedId] : undefined;

    expect(importedAsset).toMatchObject({
      imagePath: "blob://sunset",
      sourceName: "sunset.png",
      width: 2048,
      height: 1024,
    });
    expect(importedAsset?.scale).toBeLessThan(1);
  });

  it("marks the project updated when camera movement changes the saved view", () => {
    const store = createAppStore();
    store.getState().replaceProject({
      ...store.getState().project,
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    const initialUpdatedAt = store.getState().project.updatedAt;

    store.getState().panCameraBy(120, -80);

    expect(store.getState().project.camera).toMatchObject({
      x: 120,
      y: -80,
    });
    expect(store.getState().project.updatedAt).not.toBe(initialUpdatedAt);
  });

  it("adds generated assets with provenance metadata when a job succeeds", () => {
    const store = createAppStore();
    const jobId = store.getState().queueGenerationJob(sampleGenerationRequest);

    store.getState().runGenerationJob(jobId);
    const generatedIds = store.getState().completeGenerationJob(jobId, {
      provider: "mock",
      model: "mock-canvas-v1",
      completedAt: "2026-04-23T12:00:00.000Z",
      requestId: "mock-job-1",
      mode: "generate",
      images: [
        {
          imagePath: "data:image/svg+xml,%3Csvg/%3E",
          width: 1024,
          height: 1024,
          sourceName: "mock-output.svg",
        },
      ],
    });

    const generatedAsset = store.getState().project.assets[generatedIds[0]!];
    const job = store.getState().project.jobs[jobId];

    expect(job?.status).toBe("succeeded");
    expect(generatedAsset).toMatchObject({
      kind: "generated",
      sourceName: "mock-output.svg",
      generation: {
        jobId,
        provider: "mock",
        providerRequestId: "mock-job-1",
        generationMode: "generate",
        prompt: sampleGenerationRequest.prompt,
        sourceAssetIds: sampleGenerationRequest.selectedAssetIds,
      },
    });
  });

  it("captures a stable canvas placement for generation jobs", () => {
    const store = createAppStore();
    store.getState().setViewportSize(1440, 900);
    store.getState().setCameraPosition({ x: 240, y: 180 });

    const jobId = store.getState().queueGenerationJob(sampleGenerationRequest);

    expect(store.getState().project.jobs[jobId]?.canvasPlacement).toEqual({
      x: 480,
      y: 270,
    });
  });

  it("allows moving an in-progress generation placeholder without affecting the job state machine", () => {
    const store = createAppStore();
    const jobId = store.getState().queueGenerationJob(sampleGenerationRequest);

    store.getState().runGenerationJob(jobId);
    store.getState().setGenerationJobCanvasPlacement(jobId, { x: 720, y: 360 });

    expect(store.getState().project.jobs[jobId]).toMatchObject({
      status: "running",
      canvasPlacement: {
        x: 720,
        y: 360,
      },
    });
  });

  it("preserves selection references across a project replacement roundtrip", () => {
    const store = createAppStore();
    store.getState().importAssets([
      {
        imagePath: "blob://one",
        sourceName: "one.png",
        width: 1200,
        height: 900,
      },
      {
        imagePath: "blob://two",
        sourceName: "two.png",
        width: 900,
        height: 1200,
      },
    ]);

    const importedIds = [...store.getState().project.selection.assetIds];
    store.getState().setAssetPositions([
      { id: importedIds[0]!, position: { x: 32, y: 48 } },
      { id: importedIds[1]!, position: { x: 420, y: 180 } },
    ]);
    const reopenedProject = structuredClone(store.getState().project);
    store.getState().replaceProject(reopenedProject);
    store.getState().selectAssets(importedIds);

    expect(store.getState().project.selection.assetIds).toEqual(importedIds);
    expect(store.getState().project.assets[importedIds[0]!]).toMatchObject({
      x: 32,
      y: 48,
    });
  });
});
