import { useEffect, useState } from "react";

function hasImageFiles(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) {
    return false;
  }

  if (dataTransfer.items.length > 0) {
    return Array.from(dataTransfer.items).some(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
  }

  return Array.from(dataTransfer.files).some((file) => file.type.startsWith("image/"));
}

export function useWindowImageDrop(onFiles: (files: File[]) => void) {
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
      onFiles(Array.from(event.dataTransfer?.files ?? []));
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

  return isDragActive;
}
