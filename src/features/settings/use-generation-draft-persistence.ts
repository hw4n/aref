import { useEffect, useRef } from "react";

import { useAppStore } from "@/state/app-store";

import { loadGenerationDraft, saveGenerationDraft } from "./generation-draft-storage";

export function useGenerationDraftPersistence() {
  const hasHydratedRef = useRef(false);
  const generationDraft = useAppStore((state) => state.generationDraft);
  const setGenerationDraft = useAppStore((state) => state.setGenerationDraft);

  useEffect(() => {
    const storedDraft = loadGenerationDraft();
    if (storedDraft) {
      setGenerationDraft(storedDraft);
    }
  }, [setGenerationDraft]);

  useEffect(() => {
    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true;
      return;
    }

    saveGenerationDraft(generationDraft);
  }, [generationDraft]);
}
