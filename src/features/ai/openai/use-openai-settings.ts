import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  OpenAiSettingsSnapshot,
  SaveOpenAiSettingsInput,
} from "@/domain/providers/types";
import { hasTauriRuntime } from "@/features/project/persistence/tauri-runtime";

import {
  clearOpenAiSettings,
  getBrowserOpenAiSettingsSnapshot,
  getOpenAiSettings,
  saveOpenAiSettings,
} from "./openai-runtime";

type OpenAiSettingsStatus = "idle" | "loading" | "saving" | "error";

export function useOpenAiSettings() {
  const isDesktop = useMemo(() => hasTauriRuntime(), []);
  const [snapshot, setSnapshot] = useState<OpenAiSettingsSnapshot>(
    () => getBrowserOpenAiSettingsSnapshot(),
  );
  const [status, setStatus] = useState<OpenAiSettingsStatus>(isDesktop ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isDesktop) {
      setSnapshot(getBrowserOpenAiSettingsSnapshot());
      setStatus("idle");
      return;
    }

    try {
      setStatus("loading");
      const nextSnapshot = await getOpenAiSettings();
      setSnapshot(nextSnapshot);
      setError(null);
      setStatus("idle");
    } catch (nextError) {
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Failed to load OpenAI settings.");
    }
  }, [isDesktop]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (input: SaveOpenAiSettingsInput) => {
      if (!isDesktop) {
        return null;
      }

      try {
        setStatus("saving");
        const nextSnapshot = await saveOpenAiSettings(input);
        setSnapshot(nextSnapshot);
        setError(null);
        setStatus("idle");
        return nextSnapshot;
      } catch (nextError) {
        setStatus("error");
        setError(nextError instanceof Error ? nextError.message : "Failed to save OpenAI settings.");
        return null;
      }
    },
    [isDesktop],
  );

  const clear = useCallback(async () => {
    if (!isDesktop) {
      return null;
    }

    try {
      setStatus("saving");
      const nextSnapshot = await clearOpenAiSettings();
      setSnapshot(nextSnapshot);
      setError(null);
      setStatus("idle");
      return nextSnapshot;
    } catch (nextError) {
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Failed to clear OpenAI settings.");
      return null;
    }
  }, [isDesktop]);

  return {
    snapshot,
    status,
    error,
    isDesktop,
    reload,
    save,
    clear,
  };
}
