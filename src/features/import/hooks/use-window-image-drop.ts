import { useEffect, useState } from "react";

import type { DragDropEvent } from "@tauri-apps/api/webview";

import {
  filterSupportedImageFiles,
  filterSupportedImagePaths,
  isSupportedImageMimeType,
} from "@/features/import/utils/image-file";
import { hasTauriRuntime } from "@/features/project/persistence/tauri-runtime";

function hasImageFiles(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) {
    return false;
  }

  if (dataTransfer.files.length > 0) {
    return filterSupportedImageFiles(Array.from(dataTransfer.files)).length > 0;
  }

  if (dataTransfer.items.length > 0) {
    return Array.from(dataTransfer.items).some(
      (item) => item.kind === "file" && (item.type === "" || isSupportedImageMimeType(item.type)),
    );
  }

  return false;
}

export function useWindowImageDrop(
  onFiles: (files: File[]) => void,
  onPaths?: (paths: string[]) => void,
) {
  const [isDragActive, setIsDragActive] = useState(false);

  useEffect(() => {
    let dragDepth = 0;

    const onDragEnter = (event: DragEvent) => {
      if (!hasImageFiles(event.dataTransfer)) {
        return;
      }

      dragDepth += 1;
      setIsDragActive(true);
      event.preventDefault();
    };

    const onDragOver = (event: DragEvent) => {
      if (!hasImageFiles(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer!.dropEffect = "copy";
    };

    const onDragLeave = (event: DragEvent) => {
      if (!hasImageFiles(event.dataTransfer)) {
        return;
      }

      dragDepth = Math.max(0, dragDepth - 1);

      if (dragDepth === 0) {
        setIsDragActive(false);
      }

      event.preventDefault();
    };

    const onDrop = (event: DragEvent) => {
      if (!hasImageFiles(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      dragDepth = 0;
      setIsDragActive(false);
      const files = filterSupportedImageFiles(Array.from(event.dataTransfer?.files ?? []));

      if (files.length > 0) {
        onFiles(files);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFiles]);

  useEffect(() => {
    if (!onPaths || !hasTauriRuntime()) {
      return;
    }

    let isMounted = true;
    let unlisten: (() => void) | null = null;

    const handleDragDropEvent = (event: { payload: DragDropEvent }) => {
      if (!isMounted) {
        return;
      }

      if (event.payload.type === "enter") {
        setIsDragActive(filterSupportedImagePaths(event.payload.paths).length > 0);
        return;
      }

      if (event.payload.type === "drop") {
        setIsDragActive(false);
        const paths = filterSupportedImagePaths(event.payload.paths);

        if (paths.length > 0) {
          onPaths(paths);
        }

        return;
      }

      if (event.payload.type === "leave") {
        setIsDragActive(false);
      }
    };

    void import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent(handleDragDropEvent))
      .then((nextUnlisten) => {
        if (isMounted) {
          unlisten = nextUnlisten;
        } else {
          nextUnlisten();
        }
      })
      .catch(() => {
        setIsDragActive(false);
      });

    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, [onPaths]);

  return isDragActive;
}
