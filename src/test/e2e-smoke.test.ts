import { describe, expect, it } from "vitest";

import { mockGenerationProvider } from "@/services/providers/mock-provider";
import { createAppStore } from "@/state/app-store";

describe("release smoke flow", () => {
  it("covers import, arrange, reopen, ref selection, and mock generation", async () => {
    const store = createAppStore();

    store.getState().importAssets([
      {
        imagePath: "blob://ref-1",
        sourceName: "ref-1.png",
        width: 1280,
        height: 720,
      },
      {
        imagePath: "blob://ref-2",
        sourceName: "ref-2.png",
        width: 960,
        height: 960,
      },
    ]);

    const importedIds = [...store.getState().project.selection.assetIds];
    store.getState().setAssetPositions([
      { id: importedIds[0]!, position: { x: 120, y: 80 } },
      { id: importedIds[1]!, position: { x: 420, y: 240 } },
    ]);

    const savedProject = structuredClone(store.getState().project);
    store.getState().replaceProject(savedProject);
    store.getState().selectAssets(importedIds);

    const request = {
      selectedAssetIds: importedIds,
      prompt: "Generate a compact field research kit",
      provider: "mock" as const,
      model: "mock-canvas-v1",
      settings: {
        imageCount: 1,
        aspectRatio: "1:1" as const,
      },
    };
    const jobId = store.getState().queueGenerationJob(request);
    const result = await mockGenerationProvider.generateImages(
      {
        jobId,
        request,
        referenceAssets: importedIds.map((assetId) => store.getState().project.assets[assetId]!),
      },
      {
        signal: new AbortController().signal,
        onStatusChange: () => store.getState().runGenerationJob(jobId),
      },
    );
    const generatedAssetIds = store.getState().completeGenerationJob(jobId, result);

    expect(importedIds).toHaveLength(2);
    expect(store.getState().project.jobs[jobId]).toMatchObject({
      status: "succeeded",
      resultAssetIds: generatedAssetIds,
    });
    expect(store.getState().project.assets[generatedAssetIds[0]!]?.generation).toMatchObject({
      provider: "mock",
      prompt: "Generate a compact field research kit",
      sourceAssetIds: importedIds,
    });
  });
});
