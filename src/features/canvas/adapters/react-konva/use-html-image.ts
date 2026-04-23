import { useEffect, useState } from "react";

import { useRenderableImageUrl } from "@/features/images/hooks/use-renderable-image-url";

export function useHtmlImage(src: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const renderableSrc = useRenderableImageUrl(src);

  useEffect(() => {
    const nextImage = new window.Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => setImage(nextImage);

    setImage(null);
    nextImage.src = renderableSrc;

    return () => {
      nextImage.onload = null;
    };
  }, [renderableSrc]);

  return image;
}
