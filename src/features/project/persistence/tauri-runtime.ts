import { isTauri } from "@tauri-apps/api/core";

type TauriRuntimeShape = {
  __TAURI_INTERNALS__?: {
    invoke?: unknown;
  };
  isTauri?: unknown;
};

export function hasTauriRuntime() {
  if (isTauri()) {
    return true;
  }

  const runtime = globalThis as typeof globalThis & TauriRuntimeShape;

  return typeof runtime.__TAURI_INTERNALS__ === "object"
    && runtime.__TAURI_INTERNALS__ !== null
    && typeof runtime.__TAURI_INTERNALS__.invoke === "function";
}
