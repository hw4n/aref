import { useEffect, useState } from "react";

import {
  getCachedRenderableImageElement,
  loadRenderableImageElement,
} from "@/features/images/hooks/use-renderable-image-url";

export function useHtmlImage(src: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(() =>
    src ? getCachedRenderableImageElement(src) : null,
  );

  useEffect(() => {
    let cancelled = false;

    if (!src) {
      setImage(null);
      return;
    }

    const cached = getCachedRenderableImageElement(src);

    if (cached) {
      setImage(cached);
      return;
    }

    void loadRenderableImageElement(src).then((nextImage) => {
      if (!cancelled) {
        setImage(nextImage);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  return image;
}
