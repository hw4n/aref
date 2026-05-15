import type {
  GenerationImageSize,
  GenerationImageQuality,
  GenerationModeration,
  GenerationBulkGrid,
} from "@/domain/jobs/types";
import type {
  GenerationConcurrencyMode,
  ProviderAuthMethod,
  ProviderFamilyId,
} from "@/domain/providers/types";
import type { ID } from "@/domain/shared/types";

export interface GenerationSheetDraft {
  prompt: string;
  negativePrompt: string;
  provider: string;
  model: string;
  settings: {
    imageCount: number;
    size: GenerationImageSize;
    quality: GenerationImageQuality;
    moderation: GenerationModeration;
    compressReferenceImages?: boolean;
  };
  bulkGrid: GenerationBulkGrid;
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
  leftRailOpen: boolean;
  inspectorOpen: boolean;
  gridVisible: boolean;
  inspectorWidth: number;
  generationSheetWidth: number;
  settingsSection: SettingsSurfaceSection;
  developerMode: boolean;
  logsVisible: boolean;
  mockProviderEnabled: boolean;
  generationConcurrencyMode: GenerationConcurrencyMode;
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
