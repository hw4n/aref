import { useEffect, useState } from "react";

import { useRenderableImageUrl } from "@/features/images/hooks/use-renderable-image-url";

export function useHtmlImage(src: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const renderableSrc = useRenderableImageUrl(src ?? "");

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }

    const nextImage = new window.Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => setImage(nextImage);

    setImage(null);
    nextImage.src = renderableSrc;

    return () => {
      nextImage.onload = null;
    };
  }, [renderableSrc, src]);

  return image;
}
