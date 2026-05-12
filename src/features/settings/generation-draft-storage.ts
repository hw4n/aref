import type { GenerationImageQuality, GenerationImageSize, GenerationModeration } from "@/domain/jobs/types";
import type { GenerationSheetDraft } from "@/domain/ui/types";

export const GENERATION_DRAFT_STORAGE_KEY = "aref.generation-draft.v1";

type StoredGenerationSettings = Partial<GenerationSheetDraft["settings"]> & {
  aspectRatio?: string;
};

export type StoredGenerationDraft = Partial<Omit<GenerationSheetDraft, "pinnedAssetIds" | "isExplicitlyOpened" | "settings">> & {
  settings?: StoredGenerationSettings;
};

const GENERATION_SIZES = new Set<GenerationImageSize>([
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "2048x2048",
  "2048x1152",
  "3840x2160",
  "2160x3840",
]);
const GENERATION_QUALITIES = new Set<GenerationImageQuality>(["auto", "low", "medium", "high"]);
const GENERATION_MODERATIONS = new Set<GenerationModeration>(["low", "auto"]);

function legacyAspectRatioToSize(value: unknown): GenerationImageSize | null {
  if (value === "4:3") {
    return "1536x1024";
  }

  if (value === "3:4") {
    return "1024x1536";
  }

  if (value === "16:9") {
    return "2048x1152";
  }

  if (value === "9:16") {
    return "2160x3840";
  }

  if (value === "1:1") {
    return "1024x1024";
  }

  if (value === "unspecified") {
    return "auto";
  }

  return null;
}

function normalizeSize(value: unknown, legacyAspectRatio?: unknown): GenerationImageSize {
  if (typeof value === "string" && GENERATION_SIZES.has(value as GenerationImageSize)) {
    return value as GenerationImageSize;
  }

  return legacyAspectRatioToSize(legacyAspectRatio) ?? "auto";
}

function normalizeQuality(value: unknown): GenerationImageQuality {
  return typeof value === "string" && GENERATION_QUALITIES.has(value as GenerationImageQuality)
    ? value as GenerationImageQuality
    : "auto";
}

function normalizeModeration(value: unknown): GenerationModeration {
  return typeof value === "string" && GENERATION_MODERATIONS.has(value as GenerationModeration)
    ? value as GenerationModeration
    : "low";
}

function normalizeImageCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(4, Math.round(value)))
    : 1;
}

export function normalizeGenerationDraft(input: StoredGenerationDraft | null | undefined): StoredGenerationDraft {
  const settings = input?.settings ?? {};

  return {
    prompt: typeof input?.prompt === "string" ? input.prompt : "",
    negativePrompt: typeof input?.negativePrompt === "string" ? input.negativePrompt : "",
    provider: typeof input?.provider === "string" && input.provider.trim() ? input.provider : "ima2-sidecar",
    model: typeof input?.model === "string" && input.model.trim() ? input.model : "gpt-5.5",
    settings: {
      imageCount: normalizeImageCount(settings.imageCount),
      size: normalizeSize(settings.size, settings.aspectRatio),
      quality: normalizeQuality(settings.quality),
      moderation: normalizeModeration(settings.moderation),
      compressReferenceImages: settings.compressReferenceImages !== false,
    },
  };
}

export function toStoredGenerationDraft(draft: GenerationSheetDraft): StoredGenerationDraft {
  return normalizeGenerationDraft({
    prompt: draft.prompt,
    negativePrompt: draft.negativePrompt,
    provider: draft.provider,
    model: draft.model,
    settings: draft.settings,
  });
}

export function loadGenerationDraft(
  storage: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : window.localStorage,
) {
  if (!storage) {
    return null;
  }

  const rawValue = storage.getItem(GENERATION_DRAFT_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return normalizeGenerationDraft(JSON.parse(rawValue) as StoredGenerationDraft);
  } catch {
    return null;
  }
}

export function saveGenerationDraft(
  draft: GenerationSheetDraft,
  storage: Pick<Storage, "setItem"> | null = typeof window === "undefined" ? null : window.localStorage,
) {
  if (!storage) {
    return;
  }

  storage.setItem(GENERATION_DRAFT_STORAGE_KEY, JSON.stringify(toStoredGenerationDraft(draft)));
}
