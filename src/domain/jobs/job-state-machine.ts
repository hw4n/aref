import type { Point } from "@/domain/shared/types";

import type { GenerationJob, GenerationRequest } from "@/domain/jobs/types";

export function createQueuedGenerationJob(
  jobId: string,
  request: GenerationRequest,
  canvasPlacement: Point,
  previousAttemptCount = 0,
  timestamp = new Date().toISOString(),
): GenerationJob {
  return {
    id: jobId,
    request,
    canvasPlacement,
    status: "queued",
    createdAt: timestamp,
    startedAt: undefined,
    completedAt: undefined,
    cancelledAt: undefined,
    error: undefined,
    providerRequestId: undefined,
    providerMode: undefined,
    resultAssetIds: [],
    attemptCount: previousAttemptCount + 1,
  };
}

export function markGenerationJobRunning(
  job: GenerationJob,
  timestamp = new Date().toISOString(),
): GenerationJob {
  return {
    ...job,
    status: "running",
    startedAt: timestamp,
    cancelledAt: undefined,
    completedAt: undefined,
    error: undefined,
    providerRequestId: undefined,
    providerMode: undefined,
  };
}

export function markGenerationJobSucceeded(
  job: GenerationJob,
  options: {
    completedAt?: string;
    providerRequestId?: string | null;
    providerMode?: "generate" | "edit";
    resultAssetIds: string[];
  },
): GenerationJob {
  return {
    ...job,
    status: "succeeded",
    completedAt: options.completedAt ?? new Date().toISOString(),
    cancelledAt: undefined,
    error: undefined,
    providerRequestId: options.providerRequestId ?? undefined,
    providerMode: options.providerMode,
    resultAssetIds: options.resultAssetIds,
  };
}

export function markGenerationJobFailed(
  job: GenerationJob,
  error: string,
  completedAt = new Date().toISOString(),
): GenerationJob {
  return {
    ...job,
    status: "failed",
    completedAt,
    cancelledAt: undefined,
    error,
    providerRequestId: undefined,
    providerMode: undefined,
  };
}

export function markGenerationJobCancelled(
  job: GenerationJob,
  cancelledAt = new Date().toISOString(),
): GenerationJob {
  return {
    ...job,
    status: "cancelled",
    cancelledAt,
    completedAt: undefined,
    error: undefined,
    providerRequestId: undefined,
    providerMode: undefined,
  };
}
