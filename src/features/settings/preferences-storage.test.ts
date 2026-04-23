import { describe, expect, it } from "vitest";

import {
  getDefaultAppUiPreferences,
  loadAppUiPreferences,
  normalizeAppUiPreferences,
  saveAppUiPreferences,
} from "./preferences-storage";

describe("preferences storage", () => {
  it("persists the chosen auth method per provider", () => {
    const memoryStorage = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memoryStorage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memoryStorage.set(key, value);
      },
    };

    saveAppUiPreferences(
      {
        ...getDefaultAppUiPreferences(),
        developerMode: true,
        providerAuthMethods: {
          openai: "api-key",
        },
      },
      storage,
    );

    const loaded = loadAppUiPreferences(storage);
    expect(loaded.providerAuthMethods.openai).toBe("api-key");
  });

  it("normalizes log visibility when developer mode is off", () => {
    const normalized = normalizeAppUiPreferences({
      developerMode: false,
      logsVisible: true,
    });

    expect(normalized.logsVisible).toBe(false);
  });

  it("persists panel widths and falls back for invalid values", () => {
    const normalized = normalizeAppUiPreferences({
      inspectorWidth: 412,
      generationSheetWidth: -24,
    });

    expect(normalized.inspectorWidth).toBe(412);
    expect(normalized.generationSheetWidth).toBe(getDefaultAppUiPreferences().generationSheetWidth);
  });
});
