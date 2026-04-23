import { invoke } from "@tauri-apps/api/core";

import type { GenerationJobStatus, GenerationSettings } from "@/domain/jobs/types";
import type {
  OpenAiSettingsSnapshot,
  ProviderGeneratedImage,
  SaveOpenAiSettingsInput,
} from "@/domain/providers/types";
import { hasTauriRuntime } from "@/features/project/persistence/tauri-runtime";

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export interface OpenAiReferenceImagePayload {
  filename: string;
  mimeType: string;
  bytes: number[];
}

export interface StartOpenAiGenerationInput {
  jobId: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  settings: GenerationSettings;
  referenceImages: OpenAiReferenceImagePayload[];
}

export interface OpenAiOperationSubmission {
  operationId: string;
}

export interface OpenAiOperationSnapshot {
  operationId: string;
  status: GenerationJobStatus;
  completedAt?: string | null;
  error?: string | null;
  requestId?: string | null;
  mode?: "generate" | "edit" | null;
  images?: ProviderGeneratedImage[] | null;
}

function ensureTauriRuntime() {
  if (!hasTauriRuntime()) {
    throw new Error("This action is only available in the desktop app.");
  }
}

export function getBrowserOpenAiSettingsSnapshot(): OpenAiSettingsSnapshot {
  return {
    configured: false,
    available: false,
    source: "none",
    apiKeyLast4: null,
    organizationId: null,
    projectId: null,
    baseUrl: DEFAULT_OPENAI_BASE_URL,
  };
}

export async function getOpenAiSettings() {
  ensureTauriRuntime();
  return invoke<OpenAiSettingsSnapshot>("get_openai_settings");
}

export async function saveOpenAiSettings(input: SaveOpenAiSettingsInput) {
  ensureTauriRuntime();
  return invoke<OpenAiSettingsSnapshot>("save_openai_settings", { input });
}

export async function clearOpenAiSettings() {
  ensureTauriRuntime();
  return invoke<OpenAiSettingsSnapshot>("clear_openai_settings");
}

export async function startOpenAiGeneration(request: StartOpenAiGenerationInput) {
  ensureTauriRuntime();
  return invoke<OpenAiOperationSubmission>("start_openai_generation", { request });
}

export async function pollOpenAiGeneration(operationId: string) {
  ensureTauriRuntime();
  return invoke<OpenAiOperationSnapshot>("poll_openai_generation", { operationId });
}

export async function cancelOpenAiGeneration(operationId: string) {
  ensureTauriRuntime();
  return invoke<void>("cancel_openai_generation", { operationId });
}
