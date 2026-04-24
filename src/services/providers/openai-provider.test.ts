import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationProviderInvocation } from "@/domain/providers/types";

const runtimeMocks = vi.hoisted(() => ({
  startOpenAiGeneration: vi.fn(),
  pollOpenAiGeneration: vi.fn(),
  cancelOpenAiGeneration: vi.fn(),
}));

const projectIoMocks = vi.hoisted(() => ({
  readManagedImageBytes: vi.fn(),
  isLikelyFilePath: vi.fn((value: string) => value.startsWith("/")),
}));

vi.mock("@/features/ai/openai/openai-runtime", () => ({
  startOpenAiGeneration: runtimeMocks.startOpenAiGeneration,
  pollOpenAiGeneration: runtimeMocks.pollOpenAiGeneration,
  cancelOpenAiGeneration: runtimeMocks.cancelOpenAiGeneration,
}));

vi.mock("@/features/project/persistence/tauri-runtime", () => ({
  hasTauriRuntime: () => true,
}));

vi.mock("@/features/project/persistence/project-io", () => ({
  isLikelyFilePath: projectIoMocks.isLikelyFilePath,
  readManagedImageBytes: projectIoMocks.readManagedImageBytes,
}));

import { openAiGenerationProvider } from "./openai-provider";

const baseInvocation: GenerationProviderInvocation = {
  jobId: "job-openai-1",
  request: {
    selectedAssetIds: [],
    prompt: "A windswept tower above the sea",
    provider: "openai",
    model: "gpt-image-2",
    settings: {
      imageCount: 2,
      aspectRatio: "1:1",
      quality: "medium",
      moderation: "low",
    },
  },
  referenceAssets: [],
};

describe("openai generation provider", () => {
  beforeEach(() => {
    runtimeMocks.startOpenAiGeneration.mockReset();
    runtimeMocks.pollOpenAiGeneration.mockReset();
    runtimeMocks.cancelOpenAiGeneration.mockReset();
    projectIoMocks.readManagedImageBytes.mockReset();
    projectIoMocks.isLikelyFilePath.mockClear();
  });

  it("maps a prompt-only one-shot run into provider results", async () => {
    runtimeMocks.startOpenAiGeneration.mockResolvedValue({
      operationId: "operation-1",
    });
    runtimeMocks.pollOpenAiGeneration
      .mockResolvedValueOnce({
        operationId: "operation-1",
        status: "queued",
      })
      .mockResolvedValueOnce({
        operationId: "operation-1",
        status: "running",
      })
      .mockResolvedValueOnce({
        operationId: "operation-1",
        status: "succeeded",
        completedAt: "2026-04-23T10:00:00.000Z",
        requestId: "req_123",
        mode: "generate",
        images: [
          {
            imagePath: "/tmp/generated-1.png",
            width: 1024,
            height: 1024,
            sourceName: "openai-1.png",
          },
          {
            imagePath: "/tmp/generated-2.png",
            width: 1024,
            height: 1024,
            sourceName: "openai-2.png",
          },
        ],
      });

    const onStatusChange = vi.fn();
    const result = await openAiGenerationProvider.generateImages(baseInvocation, {
      signal: new AbortController().signal,
      onStatusChange,
    });

    expect(runtimeMocks.startOpenAiGeneration).toHaveBeenCalledWith({
      jobId: "job-openai-1",
      prompt: "A windswept tower above the sea",
      negativePrompt: undefined,
      model: "gpt-image-2",
      settings: {
        imageCount: 2,
        aspectRatio: "1:1",
        quality: "medium",
        moderation: "low",
      },
      referenceImages: [],
    });
    expect(onStatusChange).toHaveBeenCalledWith("running");
    expect(result).toMatchObject({
      provider: "openai",
      model: "gpt-image-2",
      requestId: "req_123",
      mode: "generate",
    });
    expect(result.images).toHaveLength(2);
  });

  it("forwards selected reference images as backend payload bytes", async () => {
    projectIoMocks.readManagedImageBytes.mockResolvedValue([1, 2, 3, 4]);
    runtimeMocks.startOpenAiGeneration.mockResolvedValue({
      operationId: "operation-2",
    });
    runtimeMocks.pollOpenAiGeneration.mockResolvedValue({
      operationId: "operation-2",
      status: "succeeded",
      completedAt: "2026-04-23T10:05:00.000Z",
      requestId: "req_456",
      mode: "edit",
      images: [
        {
          imagePath: "/tmp/generated-edit.png",
          width: 1536,
          height: 1024,
          sourceName: "openai-edit.png",
        },
      ],
    });

    await openAiGenerationProvider.generateImages(
      {
        ...baseInvocation,
        request: {
          ...baseInvocation.request,
          selectedAssetIds: ["asset-1"],
          settings: {
            imageCount: 1,
            aspectRatio: "4:3",
            quality: "medium",
            moderation: "low",
          },
        },
        referenceAssets: [
          {
            id: "asset-1",
            kind: "imported",
            imagePath: "/tmp/reference-one.jpg",
            sourceName: "reference-one.jpg",
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

    expect(projectIoMocks.readManagedImageBytes).toHaveBeenCalledWith("/tmp/reference-one.jpg");
    expect(runtimeMocks.startOpenAiGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImages: [
          {
            filename: "reference-one.jpg",
            mimeType: "image/jpeg",
            bytes: [1, 2, 3, 4],
          },
        ],
      }),
    );
  });
});
