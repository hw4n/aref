import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationProviderInvocation } from "@/domain/providers/types";

const runtimeMocks = vi.hoisted(() => ({
  startIma2SidecarGeneration: vi.fn(),
  pollIma2SidecarGeneration: vi.fn(),
  cancelIma2SidecarGeneration: vi.fn(),
}));

const projectIoMocks = vi.hoisted(() => ({
  readManagedImageBytes: vi.fn(),
  isLikelyFilePath: vi.fn((value: string) => value.startsWith("/")),
}));

vi.mock("@/features/ai/ima2-sidecar/ima2-sidecar-runtime", () => ({
  startIma2SidecarGeneration: runtimeMocks.startIma2SidecarGeneration,
  pollIma2SidecarGeneration: runtimeMocks.pollIma2SidecarGeneration,
  cancelIma2SidecarGeneration: runtimeMocks.cancelIma2SidecarGeneration,
}));

vi.mock("@/features/project/persistence/tauri-runtime", () => ({
  hasTauriRuntime: () => true,
}));

vi.mock("@/features/project/persistence/project-io", () => ({
  isLikelyFilePath: projectIoMocks.isLikelyFilePath,
  readManagedImageBytes: projectIoMocks.readManagedImageBytes,
}));

import { ima2SidecarGenerationProvider } from "./ima2-sidecar-provider";

const baseInvocation: GenerationProviderInvocation = {
  jobId: "job-sidecar-1",
  request: {
    selectedAssetIds: [],
    prompt: "A quiet alley at dawn",
    provider: "ima2-sidecar",
    model: "gpt-5.5",
    settings: {
      imageCount: 2,
      aspectRatio: "1:1",
      quality: "high",
      moderation: "auto",
    },
  },
  referenceAssets: [],
};

describe("ima2 sidecar generation provider", () => {
  beforeEach(() => {
    runtimeMocks.startIma2SidecarGeneration.mockReset();
    runtimeMocks.pollIma2SidecarGeneration.mockReset();
    runtimeMocks.cancelIma2SidecarGeneration.mockReset();
    projectIoMocks.readManagedImageBytes.mockReset();
    projectIoMocks.isLikelyFilePath.mockClear();
  });

  it("maps a prompt-only sidecar run into provider results", async () => {
    runtimeMocks.startIma2SidecarGeneration.mockResolvedValue({
      operationId: "operation-sidecar-1",
    });
    runtimeMocks.pollIma2SidecarGeneration
      .mockResolvedValueOnce({
        operationId: "operation-sidecar-1",
        status: "queued",
      })
      .mockResolvedValueOnce({
        operationId: "operation-sidecar-1",
        status: "running",
      })
      .mockResolvedValueOnce({
        operationId: "operation-sidecar-1",
        status: "succeeded",
        completedAt: "2026-04-23T11:00:00.000Z",
        requestId: "job-sidecar-1",
        mode: "generate",
        images: [
          {
            imagePath: "/tmp/sidecar-1.png",
            width: 1024,
            height: 1024,
            sourceName: "sidecar-1.png",
          },
          {
            imagePath: "/tmp/sidecar-2.png",
            width: 1024,
            height: 1024,
            sourceName: "sidecar-2.png",
          },
        ],
      });

    const onStatusChange = vi.fn();
    const result = await ima2SidecarGenerationProvider.generateImages(baseInvocation, {
      signal: new AbortController().signal,
      onStatusChange,
    });

    expect(runtimeMocks.startIma2SidecarGeneration).toHaveBeenCalledWith({
      jobId: "job-sidecar-1",
      prompt: "A quiet alley at dawn",
      negativePrompt: undefined,
      settings: {
        imageCount: 2,
        aspectRatio: "1:1",
        quality: "high",
        moderation: "auto",
      },
      referenceImages: [],
    });
    expect(onStatusChange).toHaveBeenCalledWith("running");
    expect(result).toMatchObject({
      provider: "ima2-sidecar",
      model: "gpt-5.5",
      requestId: "job-sidecar-1",
      mode: "generate",
    });
    expect(result.images).toHaveLength(2);
  });

  it("forwards a single selected reference image for edit-mode runs", async () => {
    projectIoMocks.readManagedImageBytes.mockResolvedValue([9, 8, 7, 6]);
    runtimeMocks.startIma2SidecarGeneration.mockResolvedValue({
      operationId: "operation-sidecar-2",
    });
    runtimeMocks.pollIma2SidecarGeneration.mockResolvedValue({
      operationId: "operation-sidecar-2",
      status: "succeeded",
      completedAt: "2026-04-23T11:05:00.000Z",
      requestId: "job-sidecar-2",
      mode: "edit",
      images: [
        {
          imagePath: "/tmp/sidecar-edit.png",
          width: 1536,
          height: 1024,
          sourceName: "sidecar-edit.png",
        },
      ],
    });

    await ima2SidecarGenerationProvider.generateImages(
      {
        ...baseInvocation,
        jobId: "job-sidecar-2",
        request: {
          ...baseInvocation.request,
          selectedAssetIds: ["asset-1"],
          settings: {
            imageCount: 1,
            aspectRatio: "4:3",
            quality: "low",
            moderation: "low",
          },
        },
        referenceAssets: [
          {
            id: "asset-1",
            kind: "imported",
            imagePath: "/tmp/reference-edit.jpg",
            sourceName: "reference-edit.jpg",
            thumbnailPath: null,
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
            createdAt: "2026-04-23T09:00:00.000Z",
            updatedAt: "2026-04-23T09:00:00.000Z",
          },
        ],
      },
      {
        signal: new AbortController().signal,
      },
    );

    expect(projectIoMocks.readManagedImageBytes).toHaveBeenCalledWith("/tmp/reference-edit.jpg");
    expect(runtimeMocks.startIma2SidecarGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImages: [
          {
            filename: "reference-edit.jpg",
            mimeType: "image/jpeg",
            bytes: [9, 8, 7, 6],
          },
        ],
      }),
    );
  });
});
