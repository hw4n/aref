import { useEffect, useRef } from "react";

import { useAppStore } from "@/state/app-store";

import { loadAppUiPreferences, saveAppUiPreferences } from "./preferences-storage";

export function useUiPreferencesPersistence() {
  const hasHydratedRef = useRef(false);
  const preferences = useAppStore((state) => state.uiPreferences);
  const hydrateUiPreferences = useAppStore((state) => state.hydrateUiPreferences);

  useEffect(() => {
    hydrateUiPreferences(loadAppUiPreferences());
  }, [hydrateUiPreferences]);

  useEffect(() => {
    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true;
      return;
    }

    saveAppUiPreferences(preferences);
  }, [preferences]);
}
