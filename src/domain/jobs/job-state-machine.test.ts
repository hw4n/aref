import { describe, expect, it } from "vitest";

import type { GenerationRequest } from "@/domain/jobs/types";

import {
  createQueuedGenerationJob,
  markGenerationJobCancelled,
  markGenerationJobFailed,
  markGenerationJobRunning,
  markGenerationJobSucceeded,
} from "./job-state-machine";

const request: GenerationRequest = {
  selectedAssetIds: ["asset-1"],
  prompt: "A field kit on slate",
  provider: "mock",
  model: "mock-canvas-v1",
  settings: {
    imageCount: 1,
    aspectRatio: "1:1",
    quality: "medium",
    moderation: "low",
  },
};

describe("generation job state machine", () => {
  it("creates queued jobs with incrementing attempts", () => {
    const first = createQueuedGenerationJob("job-1", request, { x: 120, y: 80 }, 0, "2026-04-23T00:00:00.000Z");
    const second = createQueuedGenerationJob("job-1", request, { x: 120, y: 80 }, first.attemptCount, "2026-04-23T00:01:00.000Z");

    expect(first.status).toBe("queued");
    expect(first.canvasPlacement).toEqual({ x: 120, y: 80 });
    expect(second.attemptCount).toBe(2);
  });

  it("transitions queued jobs through running and succeeded", () => {
    const queued = createQueuedGenerationJob("job-1", request, { x: 120, y: 80 }, 0, "2026-04-23T00:00:00.000Z");
    const running = markGenerationJobRunning(queued, "2026-04-23T00:00:02.000Z");
    const succeeded = markGenerationJobSucceeded(running, {
      completedAt: "2026-04-23T00:00:04.000Z",
      providerMode: "generate",
      providerRequestId: "req_123",
      resultAssetIds: ["asset-generated-1"],
    });

    expect(running.status).toBe("running");
    expect(succeeded).toMatchObject({
      status: "succeeded",
      providerMode: "generate",
      providerRequestId: "req_123",
      resultAssetIds: ["asset-generated-1"],
    });
  });

  it("captures failed and cancelled transitions cleanly", () => {
    const queued = createQueuedGenerationJob("job-1", request, { x: 120, y: 80 }, 0, "2026-04-23T00:00:00.000Z");
    const failed = markGenerationJobFailed(queued, "boom", "2026-04-23T00:00:03.000Z");
    const cancelled = markGenerationJobCancelled(queued, "2026-04-23T00:00:05.000Z");

    expect(failed).toMatchObject({
      status: "failed",
      error: "boom",
      completedAt: "2026-04-23T00:00:03.000Z",
    });
    expect(cancelled).toMatchObject({
      status: "cancelled",
      cancelledAt: "2026-04-23T00:00:05.000Z",
    });
  });
});
