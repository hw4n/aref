import { useLayoutEffect, useState } from "react";

const emptySize = { width: 0, height: 0 };

export function useStageContainerSize(container: HTMLElement | null) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!container) {
      setSize(emptySize);
      return undefined;
    }

    let frameId = 0;

    const measure = () => {
      const bounds = container.getBoundingClientRect();
      const nextSize = {
        width: Math.max(0, Math.round(bounds.width)),
        height: Math.max(0, Math.round(bounds.height)),
      };

      setSize((currentSize) =>
        currentSize.width === nextSize.width && currentSize.height === nextSize.height
          ? currentSize
          : nextSize,
      );
    };

    measure();
    frameId = window.requestAnimationFrame(measure);

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            measure();
          });

    observer?.observe(container);
    window.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [container]);

  return size;
}
