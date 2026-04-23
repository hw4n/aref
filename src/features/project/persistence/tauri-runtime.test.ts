import { afterEach, describe, expect, it, vi } from "vitest";

import { hasTauriRuntime } from "./tauri-runtime";

type MutableGlobal = typeof globalThis & {
  __TAURI_INTERNALS__?: {
    invoke?: unknown;
  };
};

afterEach(() => {
  delete (globalThis as MutableGlobal).__TAURI_INTERNALS__;
});

describe("hasTauriRuntime", () => {
  it("returns false without tauri globals", () => {
    expect(hasTauriRuntime()).toBe(false);
  });

  it("detects the injected tauri internals runtime", () => {
    (globalThis as MutableGlobal).__TAURI_INTERNALS__ = {
      invoke: vi.fn(),
    };

    expect(hasTauriRuntime()).toBe(true);
  });
});
