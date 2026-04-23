import { invoke } from "@tauri-apps/api/core";

import type { ProviderRequestLogEntry, ProviderRequestLogProvider } from "@/domain/providers/types";
import { hasTauriRuntime } from "@/features/project/persistence/tauri-runtime";

function ensureTauriRuntime() {
  if (!hasTauriRuntime()) {
    throw new Error("Provider logs are only available in the desktop app.");
  }
}

export async function listProviderRequestLogs(provider: ProviderRequestLogProvider, limit = 12) {
  ensureTauriRuntime();
  return invoke<ProviderRequestLogEntry[]>("list_provider_request_logs", { provider, limit });
}
