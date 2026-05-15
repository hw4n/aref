import type { ID, Point } from "@/domain/shared/types";

export type GenerationJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type GenerationImageSize =
  | "auto"
  | "1024x1024"
  | "1536x1024"
  | "1024x1536"
  | "2048x2048"
  | "2048x1152"
  | "3840x2160"
  | "2160x3840";
export type GenerationImageQuality = "auto" | "low" | "medium" | "high";
export type GenerationModeration = "low" | "auto";

export interface GenerationSettings {
  imageCount: number;
  size: GenerationImageSize;
  quality: GenerationImageQuality;
  moderation: GenerationModeration;
  compressReferenceImages?: boolean;
}

export interface GenerationRequest {
  selectedAssetIds: ID[];
  prompt: string;
  negativePrompt?: string;
  provider: string;
  model: string;
  settings: GenerationSettings;
}

export interface GenerationBulkGrid {
  columns: number;
  rows: number;
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
