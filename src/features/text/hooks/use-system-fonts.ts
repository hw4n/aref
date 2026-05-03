import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { hasTauriRuntime } from "@/features/project/persistence/tauri-runtime";

const FALLBACK_SYSTEM_FONT_FAMILIES = [
  "Segoe UI",
  "Arial",
  "Calibri",
  "Cambria",
  "Candara",
  "Consolas",
  "Courier New",
  "Georgia",
  "Impact",
  "Lucida Console",
  "Malgun Gothic",
  "Microsoft JhengHei",
  "Microsoft YaHei",
  "Nirmala UI",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
];

interface LocalFontData {
  family: string;
  fullName?: string;
  postscriptName?: string;
  style?: string;
}

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontData[]>;
  }
}

function uniqueSortedFonts(fontFamilies: string[]) {
  return Array.from(
    new Set(
      fontFamilies
        .map((family) => family.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function useSystemFonts(currentFontFamily: string) {
  const [localFontFamilies, setLocalFontFamilies] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "fallback">("idle");

  const loadSystemFonts = useCallback(async () => {
    if (hasTauriRuntime()) {
      setStatus("loading");
      try {
        const fonts = await invoke<string[]>("list_system_fonts");
        const families = uniqueSortedFonts(fonts);

        if (families.length > 0) {
          setLocalFontFamilies(families);
          setStatus("ready");
          return;
        }
      } catch {
        // Fall through to browser and curated system-family fallbacks.
      }
    }

    if (!window.queryLocalFonts) {
      setStatus("fallback");
      return;
    }

    setStatus("loading");
    try {
      const fonts = await window.queryLocalFonts();
      const families = uniqueSortedFonts(fonts.map((font) => font.family));
      setLocalFontFamilies(families);
      setStatus(families.length > 0 ? "ready" : "fallback");
    } catch {
      setStatus("fallback");
    }
  }, []);

  useEffect(() => {
    void loadSystemFonts();
  }, [loadSystemFonts]);

  const fontFamilies = useMemo(
    () =>
      uniqueSortedFonts([
        currentFontFamily,
        ...localFontFamilies,
        ...FALLBACK_SYSTEM_FONT_FAMILIES,
      ]),
    [currentFontFamily, localFontFamilies],
  );

  return {
    fontFamilies,
    loadSystemFonts,
    status,
  };
}
