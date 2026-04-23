import type { CameraState } from "@/domain/camera/types";
import {
  computeGenerationCanvasLayout,
  computeGeneratedScale,
  getViewportCenter,
} from "@/domain/jobs/generation-layout";
import type { GenerationJob } from "@/domain/jobs/types";
import type { GenerationProviderResult } from "@/domain/providers/types";

import type { AssetItem } from "./types";

export function createGeneratedAssets(
  result: GenerationProviderResult,
  existingAssets: Record<string, AssetItem>,
  camera: CameraState,
  job: GenerationJob,
): AssetItem[] {
  const timestamp = job.completedAt ?? new Date().toISOString();
  const origin = job.canvasPlacement ?? getViewportCenter(camera);
  const nextZIndex = Object.values(existingAssets).reduce(
    (highest, asset) => Math.max(highest, asset.zIndex),
    -1,
  ) + 1;
  const frames = result.images.map((draft) => {
    const scale = computeGeneratedScale(draft.width, draft.height);
    return {
      width: draft.width * scale,
      height: draft.height * scale,
    };
  });
  const positions = computeGenerationCanvasLayout(frames, origin);

  return result.images.map((draft, index) => {
    const placement = positions[index] ?? origin;

    return {
      id: crypto.randomUUID(),
      kind: "generated",
      imagePath: draft.imagePath,
      sourceName: draft.sourceName ?? `${result.provider}-generated-${index + 1}.png`,
      thumbnailPath: draft.thumbnailPath ?? null,
      width: draft.width,
      height: draft.height,
      x: placement.x,
      y: placement.y,
      rotation: 0,
      scale: computeGeneratedScale(draft.width, draft.height),
      zIndex: nextZIndex + index,
      locked: false,
      hidden: false,
      tags: ["generated", result.provider],
      createdAt: timestamp,
      updatedAt: timestamp,
      generation: {
        jobId: job.id,
        provider: result.provider,
        model: result.model,
        providerRequestId: result.requestId ?? null,
        generationMode: result.mode,
        prompt: job.request.prompt,
        negativePrompt: job.request.negativePrompt,
        sourceAssetIds: job.request.selectedAssetIds,
        settings: job.request.settings,
        submittedAt: job.createdAt,
        completedAt: job.completedAt ?? timestamp,
        status: "succeeded",
      },
    };
  });
}
