import type {
  GenerationAspectRatio,
  GenerationImageQuality,
  GenerationModeration,
} from "@/domain/jobs/types";
import type { ProviderAuthMethod, ProviderFamilyId } from "@/domain/providers/types";
import type { ID } from "@/domain/shared/types";

export interface GenerationSheetDraft {
  prompt: string;
  negativePrompt: string;
  provider: string;
  model: string;
  settings: {
    imageCount: number;
    aspectRatio: GenerationAspectRatio;
    quality: GenerationImageQuality;
    moderation: GenerationModeration;
  };
  pinnedAssetIds: ID[] | null;
  isExplicitlyOpened: boolean;
}

export interface VisibilityHistoryEntry {
  assetIds: ID[];
  previousHiddenById: Record<ID, boolean>;
  nextHiddenById: Record<ID, boolean>;
}

export type SettingsSurfaceSection = "providers" | "developer";
export type DiagnosticLogLevel = "info" | "warning" | "error";
export type DiagnosticLogScope = "provider" | "auth" | "generation" | "system";

export interface AppUiPreferences {
  settingsOpen: boolean;
  leftSidebarOpen: boolean;
  inspectorOpen: boolean;
  inspectorWidth: number;
  generationSheetWidth: number;
  settingsSection: SettingsSurfaceSection;
  developerMode: boolean;
  logsVisible: boolean;
  mockProviderEnabled: boolean;
  providerAuthMethods: Partial<Record<ProviderFamilyId, ProviderAuthMethod>>;
}

export interface DiagnosticLogEntry {
  id: ID;
  timestamp: string;
  level: DiagnosticLogLevel;
  scope: DiagnosticLogScope;
  title: string;
  message: string;
  details?: string | null;
}
