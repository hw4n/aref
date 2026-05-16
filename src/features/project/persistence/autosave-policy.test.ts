import { describe, expect, it } from "vitest";

import {
  AUTOSAVE_HIDDEN_DOCUMENT_DELAY_MS,
  AUTOSAVE_USER_IDLE_MS,
  getAutosaveDelayMs,
} from "./autosave-policy";

describe("autosave policy", () => {
  it("waits until the user has been idle for one minute", () => {
    expect(getAutosaveDelayMs({
      isDocumentHidden: false,
      lastUserActivityAt: 1_000,
      now: 31_000,
    })).toBe(30_000);

    expect(getAutosaveDelayMs({
      isDocumentHidden: false,
      lastUserActivityAt: 1_000,
      now: 1_000 + AUTOSAVE_USER_IDLE_MS,
    })).toBe(0);
  });

  it("uses a short delay when the document is hidden", () => {
    expect(getAutosaveDelayMs({
      isDocumentHidden: true,
      lastUserActivityAt: 1_000,
      now: 1_500,
    })).toBe(AUTOSAVE_HIDDEN_DOCUMENT_DELAY_MS);
  });
});
