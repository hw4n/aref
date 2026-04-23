import type { AppUiPreferences } from "@/domain/ui/types";

export const APP_UI_PREFERENCES_STORAGE_KEY = "aref.ui-preferences.v1";
const DEFAULT_INSPECTOR_WIDTH = 320;
const DEFAULT_GENERATION_SHEET_WIDTH = 360;

function normalizePanelWidth(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 240
    ? Math.round(value)
    : fallback;
}

export function getDefaultAppUiPreferences(): AppUiPreferences {
  return {
    settingsOpen: false,
    leftSidebarOpen: false,
    inspectorOpen: false,
    inspectorWidth: DEFAULT_INSPECTOR_WIDTH,
    generationSheetWidth: DEFAULT_GENERATION_SHEET_WIDTH,
    settingsSection: "general",
    developerMode: false,
    logsVisible: false,
    mockProviderEnabled: false,
    providerAuthMethods: {
      openai: "oauth",
    },
  };
}

export function normalizeAppUiPreferences(input: Partial<AppUiPreferences> | null | undefined): AppUiPreferences {
  const defaults = getDefaultAppUiPreferences();
  const nextPreferences = input ?? {};

  return {
    settingsOpen: nextPreferences.settingsOpen ?? defaults.settingsOpen,
    leftSidebarOpen: nextPreferences.leftSidebarOpen ?? defaults.leftSidebarOpen,
    inspectorOpen: nextPreferences.inspectorOpen ?? defaults.inspectorOpen,
    inspectorWidth: normalizePanelWidth(nextPreferences.inspectorWidth, defaults.inspectorWidth),
    generationSheetWidth: normalizePanelWidth(nextPreferences.generationSheetWidth, defaults.generationSheetWidth),
    settingsSection:
      nextPreferences.settingsSection === "providers"
      || nextPreferences.settingsSection === "developer"
      || nextPreferences.settingsSection === "general"
        ? nextPreferences.settingsSection
        : defaults.settingsSection,
    developerMode: nextPreferences.developerMode ?? defaults.developerMode,
    logsVisible: nextPreferences.developerMode
      ? (nextPreferences.logsVisible ?? defaults.logsVisible)
      : false,
    mockProviderEnabled: nextPreferences.mockProviderEnabled ?? defaults.mockProviderEnabled,
    providerAuthMethods: {
      openai:
        nextPreferences.providerAuthMethods?.openai === "api-key"
        || nextPreferences.providerAuthMethods?.openai === "oauth"
          ? nextPreferences.providerAuthMethods.openai
          : defaults.providerAuthMethods.openai,
    },
  };
}

export function loadAppUiPreferences(storage: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : window.localStorage) {
  if (!storage) {
    return getDefaultAppUiPreferences();
  }

  const rawValue = storage.getItem(APP_UI_PREFERENCES_STORAGE_KEY);
  if (!rawValue) {
    return getDefaultAppUiPreferences();
  }

  try {
    return normalizeAppUiPreferences(JSON.parse(rawValue) as Partial<AppUiPreferences>);
  } catch {
    return getDefaultAppUiPreferences();
  }
}

export function saveAppUiPreferences(
  preferences: AppUiPreferences,
  storage: Pick<Storage, "setItem"> | null = typeof window === "undefined" ? null : window.localStorage,
) {
  if (!storage) {
    return;
  }

  storage.setItem(
    APP_UI_PREFERENCES_STORAGE_KEY,
    JSON.stringify(normalizeAppUiPreferences(preferences)),
  );
}
