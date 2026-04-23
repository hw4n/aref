import { useEffect } from "react";

import { getClipboardImageFiles } from "@/features/import/utils/clipboard-image-files";

export function useWindowImagePaste(onFiles: (files: File[]) => void | Promise<void>) {
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = getClipboardImageFiles(event.clipboardData);

      if (files.length === 0) {
        return;
      }

      event.preventDefault();
      void onFiles(files);
    };

    window.addEventListener("paste", onPaste);

    return () => {
      window.removeEventListener("paste", onPaste);
    };
  }, [onFiles]);
}
