import type {
  GenerationProviderInvocation,
  GenerationProviderResult,
  OneShotGenerationProviderAdapter,
} from "@/domain/providers/types";
import {
  ensureManagedImageThumbnails,
  isLikelyFilePath,
  readManagedImageBytes,
} from "@/features/project/persistence/project-io";
import { hasTauriRuntime } from "@/features/project/persistence/tauri-runtime";

import {
  cancelOpenAiGeneration,
  pollOpenAiGeneration,
  startOpenAiGeneration,
  type OpenAiReferenceImagePayload,
} from "@/features/ai/openai/openai-runtime";

const OPENAI_POLL_INTERVAL_MS = 650;
const OPENAI_SUPPORTED_REFERENCE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function createAbortError() {
  const error = new Error("Generation cancelled.");
  error.name = "AbortError";
  return error;
}

function waitWithAbort(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }

    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError());
    };

    signal.addEventListener("abort", onAbort);
  });
}

function sanitizeFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "-");
}

function inferExtension(asset: GenerationProviderInvocation["referenceAssets"][number], mimeType?: string | null) {
  if (mimeType) {
    const normalizedMimeType = mimeType.toLowerCase().split(";")[0];
    if (normalizedMimeType === "image/jpeg") {
      return "jpg";
    }
    if (normalizedMimeType === "image/png") {
      return "png";
    }
    if (normalizedMimeType === "image/webp") {
      return "webp";
    }
  }

  const source = asset.sourceName ?? asset.imagePath;
  const extension = source.split(".").at(-1)?.toLowerCase();
  if (extension && extension in EXTENSION_TO_MIME_TYPE) {
    return extension;
  }

  return "png";
}

function inferMimeTypeFromSource(source: string) {
  if (source.startsWith("data:")) {
    const mimeType = source.slice("data:".length).split(/[;,]/)[0]?.toLowerCase();
    return mimeType || null;
  }

  const extension = source.split(".").at(-1)?.toLowerCase();
  return extension ? EXTENSION_TO_MIME_TYPE[extension] ?? null : null;
}

function toSupportedMimeType(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase().split(";")[0];
  if (normalized === "image/jpg") {
    return "image/jpeg";
  }

  return normalized;
}

async function readReferenceImagePayload(
  asset: GenerationProviderInvocation["referenceAssets"][number],
  index: number,
): Promise<OpenAiReferenceImagePayload> {
  const fallbackMimeType = toSupportedMimeType(inferMimeTypeFromSource(asset.sourceName ?? asset.imagePath));
  let bytes: number[] | null = null;
  let mimeType = fallbackMimeType;

  if (hasTauriRuntime() && isLikelyFilePath(asset.imagePath)) {
    bytes = await readManagedImageBytes(asset.imagePath);
  } else {
    const response = await fetch(asset.imagePath);

    if (!response.ok) {
      throw new Error(`Failed to load reference image: ${asset.sourceName ?? asset.id}.`);
    }

    bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
    mimeType = toSupportedMimeType(response.headers.get("content-type")) ?? fallbackMimeType;
  }

  if (!bytes || bytes.length === 0) {
    throw new Error(`Reference image is empty: ${asset.sourceName ?? asset.id}.`);
  }

  if (!mimeType || !OPENAI_SUPPORTED_REFERENCE_TYPES.has(mimeType)) {
    throw new Error(
      `OpenAI reference images must be PNG, JPG, or WEBP. ${asset.sourceName ?? asset.id} is not supported.`,
    );
  }

  const extension = inferExtension(asset, mimeType);
  const baseName = sanitizeFileName(asset.sourceName ?? `reference-${index + 1}`);
  const filename = baseName.includes(".") ? baseName : `${baseName}.${extension}`;

  return {
    filename,
    mimeType,
    bytes,
  };
}

export const openAiGenerationProvider: OneShotGenerationProviderAdapter = {
  id: "openai",
  label: "OpenAI",
  defaultModel: "gpt-image-2",
  flowKind: "one-shot",
  models: [
    { id: "gpt-image-2", label: "GPT Image 2" },
    { id: "gpt-image-1.5", label: "GPT Image 1.5" },
    { id: "gpt-image-1", label: "GPT Image 1" },
    { id: "gpt-image-1-mini", label: "GPT Image 1 Mini" },
  ],
  async generateImages(invocation, options): Promise<GenerationProviderResult> {
    if (!hasTauriRuntime()) {
      throw new Error("OpenAI generation is only available in the desktop app.");
    }

    if (options.signal.aborted) {
      throw createAbortError();
    }

    const referenceImages = await Promise.all(
      invocation.referenceAssets.map((asset, index) => readReferenceImagePayload(asset, index)),
    );

    const submission = await startOpenAiGeneration({
      jobId: invocation.jobId,
      prompt: invocation.request.prompt,
      negativePrompt: invocation.request.negativePrompt,
      model: invocation.request.model,
      settings: invocation.request.settings,
      referenceImages,
    });

    const handleAbort = () => {
      void cancelOpenAiGeneration(submission.operationId);
    };

    options.signal.addEventListener("abort", handleAbort, { once: true });

    let hasMarkedRunning = false;

    try {
      while (true) {
        if (options.signal.aborted) {
          throw createAbortError();
        }

        const snapshot = await pollOpenAiGeneration(submission.operationId);

        if (snapshot.status === "running" && !hasMarkedRunning) {
          options.onStatusChange?.("running");
          hasMarkedRunning = true;
        }

        if (snapshot.status === "succeeded") {
          const images = await ensureManagedImageThumbnails(snapshot.images ?? []);

          return {
            provider: this.id,
            model: invocation.request.model,
            completedAt: snapshot.completedAt ?? new Date().toISOString(),
            requestId: snapshot.requestId ?? null,
            mode: snapshot.mode ?? (referenceImages.length > 0 ? "edit" : "generate"),
            images,
          };
        }

        if (snapshot.status === "failed") {
          throw new Error(snapshot.error ?? "OpenAI generation failed.");
        }

        if (snapshot.status === "cancelled") {
          throw createAbortError();
        }

        await waitWithAbort(OPENAI_POLL_INTERVAL_MS, options.signal);
      }
    } finally {
      options.signal.removeEventListener("abort", handleAbort);
    }
  },
};
