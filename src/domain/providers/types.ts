import type { AssetItem } from "@/domain/assets/types";
import type { GenerationJobStatus, GenerationRequest } from "@/domain/jobs/types";

export type GenerationProviderFlowKind = "one-shot" | "conversational";
export type ProviderAvailabilityState = "available" | "auth-required" | "unavailable" | "disabled";
export type ProviderAvailabilityTone = "positive" | "warning" | "danger" | "muted";
export type ProviderAuthMethod = "oauth" | "api-key";
export type ProviderFamilyId = "openai" | "mock";

export interface GenerationProviderModel {
  id: string;
  label: string;
}

export interface ProviderAvailabilityDescriptor {
  state: ProviderAvailabilityState;
  label: string;
  reason: string;
  tone: ProviderAvailabilityTone;
}

export interface ProviderGeneratedImage {
  imagePath: string;
  thumbnailPath?: string | null;
  width: number;
  height: number;
  sourceName?: string;
}

export interface GenerationProviderInvocation {
  jobId: string;
  request: GenerationRequest;
  referenceAssets: AssetItem[];
}

export interface GenerationProviderRunOptions {
  signal: AbortSignal;
  onStatusChange?: (status: Extract<GenerationJobStatus, "running">) => void;
}

export interface GenerationProviderResult {
  provider: string;
  model: string;
  completedAt: string;
  requestId?: string | null;
  mode?: "generate" | "edit";
  images: ProviderGeneratedImage[];
}

interface BaseGenerationProviderAdapter {
  id: string;
  label: string;
  defaultModel: string;
  models: GenerationProviderModel[];
  flowKind: GenerationProviderFlowKind;
}

export interface OneShotGenerationProviderAdapter extends BaseGenerationProviderAdapter {
  flowKind: "one-shot";
  generateImages: (
    invocation: GenerationProviderInvocation,
    options: GenerationProviderRunOptions,
  ) => Promise<GenerationProviderResult>;
}

export interface ConversationalGenerationProviderAdapter extends BaseGenerationProviderAdapter {
  flowKind: "conversational";
}

export type GenerationProviderAdapter =
  | OneShotGenerationProviderAdapter
  | ConversationalGenerationProviderAdapter;

export interface OpenAiSettingsSnapshot {
  configured: boolean;
  available: boolean;
  source: "stored" | "environment" | "none";
  apiKeyLast4: string | null;
  organizationId: string | null;
  projectId: string | null;
  baseUrl: string;
}

export interface SaveOpenAiSettingsInput {
  apiKey?: string;
  organizationId?: string;
  projectId?: string;
  baseUrl?: string;
}

export type Ima2SidecarOAuthStatus =
  | "ready"
  | "auth_required"
  | "offline"
  | "starting"
  | "unknown"
  | "node_missing";
export type CodexAuthStatus = "authed" | "unauthed" | "missing" | "unknown" | "auth_file_missing";

export interface Ima2SidecarSettingsSnapshot {
  configured: boolean;
  available: boolean;
  source: "stored" | "environment" | "default";
  baseUrl: string;
  oauthStatus: Ima2SidecarOAuthStatus;
  codexAuthStatus: CodexAuthStatus;
  models: string[];
  proxyManaged: boolean;
  authFilePath: string;
  proxyLogPath: string;
  loginLogPath: string;
  lastProxyError?: string | null;
}

export interface Ima2SidecarLoginLaunchSnapshot {
  status: "pending" | "fallback_pending";
  logPath: string;
  fallbackVisible: boolean;
}

export interface SaveIma2SidecarSettingsInput {
  baseUrl?: string;
}

export type ProviderRequestLogProvider = "openai" | "ima2-sidecar";

export interface ProviderRequestLogEntry {
  provider: ProviderRequestLogProvider;
  timestamp?: string | null;
  status?: string | null;
  model?: string | null;
  mode?: string | null;
  operationId?: string | null;
  clientRequestId?: string | null;
  providerRequestId?: string | null;
  promptLength?: number | null;
  imageCount?: number | null;
  referenceCount?: number | null;
  error?: string | null;
  rawJson: string;
}
