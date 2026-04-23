import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  Ima2SidecarSettingsSnapshot,
  SaveIma2SidecarSettingsInput,
} from "@/domain/providers/types";
import { hasTauriRuntime } from "@/features/project/persistence/tauri-runtime";

import {
  clearIma2SidecarSettings,
  getBrowserIma2SidecarSettingsSnapshot,
  getIma2SidecarSettings,
  launchIma2SidecarLogin,
  saveIma2SidecarSettings,
  startIma2SidecarProxy,
} from "./ima2-sidecar-runtime";

type Ima2SidecarSettingsStatus = "idle" | "loading" | "saving" | "error";

export function useIma2SidecarSettings() {
  const isDesktop = useMemo(() => hasTauriRuntime(), []);
  const [snapshot, setSnapshot] = useState<Ima2SidecarSettingsSnapshot>(
    () => getBrowserIma2SidecarSettingsSnapshot(),
  );
  const [status, setStatus] = useState<Ima2SidecarSettingsStatus>(isDesktop ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isDesktop) {
      setSnapshot(getBrowserIma2SidecarSettingsSnapshot());
      setStatus("idle");
      return;
    }

    try {
      setStatus("loading");
      const nextSnapshot = await getIma2SidecarSettings();
      setSnapshot(nextSnapshot);
      setError(null);
      setStatus("idle");
    } catch (nextError) {
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Failed to load ChatGPT OAuth settings.");
    }
  }, [isDesktop]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (input: SaveIma2SidecarSettingsInput) => {
      if (!isDesktop) {
        return null;
      }

      try {
        setStatus("saving");
        const nextSnapshot = await saveIma2SidecarSettings(input);
        setSnapshot(nextSnapshot);
        setError(null);
        setStatus("idle");
        return nextSnapshot;
      } catch (nextError) {
        setStatus("error");
        setError(nextError instanceof Error ? nextError.message : "Failed to save ChatGPT OAuth settings.");
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
      const nextSnapshot = await clearIma2SidecarSettings();
      setSnapshot(nextSnapshot);
      setError(null);
      setStatus("idle");
      return nextSnapshot;
    } catch (nextError) {
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Failed to clear ChatGPT OAuth settings.");
      return null;
    }
  }, [isDesktop]);

  const startProxy = useCallback(async () => {
    if (!isDesktop) {
      return null;
    }

    try {
      setStatus("saving");
      const nextSnapshot = await startIma2SidecarProxy();
      setSnapshot(nextSnapshot);
      setError(null);
      setStatus("idle");
      return nextSnapshot;
    } catch (nextError) {
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Failed to start the OAuth proxy.");
      return null;
    }
  }, [isDesktop]);

  const startLogin = useCallback(async () => {
    if (!isDesktop) {
      return false;
    }

    try {
      setStatus("saving");
      await launchIma2SidecarLogin();
      setError(null);
      setStatus("idle");
      return true;
    } catch (nextError) {
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Failed to start Codex login.");
      return false;
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
    startProxy,
    startLogin,
  };
}
