import { invoke } from "@tauri-apps/api/core";

import type { GenerationJobStatus } from "@/domain/jobs/types";
import type {
  Ima2SidecarSettingsSnapshot,
  ProviderGeneratedImage,
  SaveIma2SidecarSettingsInput,
} from "@/domain/providers/types";
import { hasTauriRuntime } from "@/features/project/persistence/tauri-runtime";

export const DEFAULT_IMA2_SIDECAR_BASE_URL = "http://127.0.0.1:10531";

export interface Ima2SidecarReferenceImagePayload {
  filename: string;
  mimeType: string;
  bytes: number[];
}

export interface StartIma2SidecarGenerationInput {
  jobId: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  settings: {
    imageCount: number;
    aspectRatio: string;
  };
  referenceImages: Ima2SidecarReferenceImagePayload[];
}

export interface Ima2SidecarOperationSubmission {
  operationId: string;
}

export interface Ima2SidecarOperationSnapshot {
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

export function getBrowserIma2SidecarSettingsSnapshot(): Ima2SidecarSettingsSnapshot {
  return {
    configured: false,
    available: false,
    source: "default",
    baseUrl: DEFAULT_IMA2_SIDECAR_BASE_URL,
    oauthStatus: "offline",
    codexAuthStatus: "unknown",
    models: [],
    proxyManaged: false,
  };
}

export async function getIma2SidecarSettings() {
  ensureTauriRuntime();
  return invoke<Ima2SidecarSettingsSnapshot>("get_ima2_sidecar_settings");
}

export async function saveIma2SidecarSettings(input: SaveIma2SidecarSettingsInput) {
  ensureTauriRuntime();
  return invoke<Ima2SidecarSettingsSnapshot>("save_ima2_sidecar_settings", { input });
}

export async function clearIma2SidecarSettings() {
  ensureTauriRuntime();
  return invoke<Ima2SidecarSettingsSnapshot>("clear_ima2_sidecar_settings");
}

export async function startIma2SidecarProxy() {
  ensureTauriRuntime();
  return invoke<Ima2SidecarSettingsSnapshot>("start_ima2_sidecar_proxy");
}

export async function launchIma2SidecarLogin() {
  ensureTauriRuntime();
  return invoke<void>("launch_ima2_sidecar_login");
}

export async function startIma2SidecarGeneration(request: StartIma2SidecarGenerationInput) {
  ensureTauriRuntime();
  return invoke<Ima2SidecarOperationSubmission>("start_ima2_sidecar_generation", { request });
}

export async function pollIma2SidecarGeneration(operationId: string) {
  ensureTauriRuntime();
  return invoke<Ima2SidecarOperationSnapshot>("poll_ima2_sidecar_generation", { operationId });
}

export async function cancelIma2SidecarGeneration(operationId: string) {
  ensureTauriRuntime();
  return invoke<void>("cancel_ima2_sidecar_generation", { operationId });
}
