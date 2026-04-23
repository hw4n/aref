import type { GenerationJobStatus, GenerationSettings } from "@/domain/jobs/types";
import type { ID } from "@/domain/shared/types";

export interface GeneratedAssetMetadata {
  jobId: ID;
  provider: string;
  model: string;
  providerRequestId?: string | null;
  generationMode?: "generate" | "edit";
  prompt: string;
  negativePrompt?: string;
  sourceAssetIds: ID[];
  settings: GenerationSettings;
  submittedAt: string;
  completedAt?: string;
  status: GenerationJobStatus;
}

export interface AssetItem {
  id: ID;
  kind: "imported" | "generated";
  imagePath: string;
  sourceName?: string;
  thumbnailPath?: string | null;
  width: number;
  height: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  zIndex: number;
  locked: boolean;
  hidden: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  generation?: GeneratedAssetMetadata;
}
