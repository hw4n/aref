import { useEffect, useState } from "react";

import { isLikelyFilePath, readManagedImageBytes } from "@/features/project/persistence/project-io";
import { hasTauriRuntime } from "@/features/project/persistence/tauri-runtime";

export function useRenderableImageUrl(source: string) {
  const [resolvedSource, setResolvedSource] = useState(source);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    const resolve = async () => {
      try {
        if (hasTauriRuntime() && isLikelyFilePath(source)) {
          const bytes = await readManagedImageBytes(source);
          objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));

          if (!cancelled) {
            setResolvedSource(objectUrl);
          }

          return;
        }

        setResolvedSource(source);
      } catch {
        if (!cancelled) {
          setResolvedSource(source);
        }
      }
    };

    void resolve();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [source]);

  return resolvedSource;
}
