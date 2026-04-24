import type { ID, Point } from "@/domain/shared/types";

export type GenerationJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type GenerationAspectRatio = "unspecified" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
export type GenerationImageQuality = "low" | "medium" | "high";
export type GenerationModeration = "low" | "auto";

export interface GenerationSettings {
  imageCount: number;
  aspectRatio: GenerationAspectRatio;
  quality: GenerationImageQuality;
  moderation: GenerationModeration;
}

export interface GenerationRequest {
  selectedAssetIds: ID[];
  prompt: string;
  negativePrompt?: string;
  provider: string;
  model: string;
  settings: GenerationSettings;
}

export interface GenerationJob {
  id: ID;
  request: GenerationRequest;
  canvasPlacement: Point;
  status: GenerationJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  error?: string;
  providerRequestId?: string | null;
  providerMode?: "generate" | "edit";
  resultAssetIds: ID[];
  attemptCount: number;
}
