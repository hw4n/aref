import { useCallback, useEffect, useMemo, useState } from "react";

import type { ProviderRequestLogEntry, ProviderRequestLogProvider } from "@/domain/providers/types";
import { hasTauriRuntime } from "@/features/project/persistence/tauri-runtime";

import { listProviderRequestLogs } from "./provider-logs-runtime";

type ProviderRequestLogStatus = "idle" | "loading" | "error";

const SUPPORTED_LOG_PROVIDERS = new Set<ProviderRequestLogProvider>(["openai", "ima2-sidecar"]);

export function useProviderRequestLogs(providerId: string | null | undefined, limit = 12) {
  const isDesktop = useMemo(() => hasTauriRuntime(), []);
  const supportedProvider = useMemo(
    () =>
      providerId && SUPPORTED_LOG_PROVIDERS.has(providerId as ProviderRequestLogProvider)
        ? (providerId as ProviderRequestLogProvider)
        : null,
    [providerId],
  );
  const [entries, setEntries] = useState<ProviderRequestLogEntry[]>([]);
  const [status, setStatus] = useState<ProviderRequestLogStatus>(isDesktop ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isDesktop || !supportedProvider) {
      setEntries([]);
      setError(null);
      setStatus("idle");
      return;
    }

    try {
      setStatus("loading");
      const nextEntries = await listProviderRequestLogs(supportedProvider, limit);
      setEntries(nextEntries);
      setError(null);
      setStatus("idle");
    } catch (nextError) {
      setEntries([]);
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Failed to load provider logs.");
    }
  }, [isDesktop, limit, supportedProvider]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    entries,
    error,
    isDesktop,
    reload,
    status,
    supportedProvider,
  };
}
