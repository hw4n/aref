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

export type AssetKind = "imported" | "generated" | "text";

export type TextAssetAlignment = "left" | "center" | "right";
export type TextAssetFontStyle = "normal" | "bold" | "italic" | "bold italic";

export interface TextAssetContent {
  value: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: TextAssetFontStyle;
  fill: string;
  align: TextAssetAlignment;
  lineHeight: number;
}

export interface AssetItem {
  id: ID;
  kind: AssetKind;
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
  text?: TextAssetContent;
}

export type ImageAssetItem = AssetItem & {
  kind: "imported" | "generated";
  imagePath: string;
};

export type TextAssetItem = AssetItem & {
  kind: "text";
  text: TextAssetContent;
};

export function isImageAsset(asset: AssetItem): asset is ImageAssetItem {
  return asset.kind === "imported" || asset.kind === "generated";
}

export function isTextAsset(asset: AssetItem): asset is TextAssetItem {
  return asset.kind === "text" && Boolean(asset.text);
}
