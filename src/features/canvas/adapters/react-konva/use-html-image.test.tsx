import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getCachedRenderableImageElement,
  loadRenderableImageElement,
} from "@/features/images/hooks/use-renderable-image-url";

import { useHtmlImage } from "./use-html-image";

vi.mock("@/features/images/hooks/use-renderable-image-url", () => ({
  getCachedRenderableImageElement: vi.fn(),
  loadRenderableImageElement: vi.fn(),
}));

function createImage(label: string) {
  const image = new Image();
  image.dataset.label = label;
  return image;
}

function ImageProbe({ src }: { src: string | null }) {
  const image = useHtmlImage(src);

  return <div data-testid="image">{image?.dataset.label ?? "none"}</div>;
}

describe("useHtmlImage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses cached images without starting another load", () => {
    const cachedImage = createImage("cached");
    vi.mocked(getCachedRenderableImageElement).mockReturnValue(cachedImage);

    render(<ImageProbe src="cached.png" />);

    expect(screen.getByTestId("image").textContent).toBe("cached");
    expect(loadRenderableImageElement).not.toHaveBeenCalled();
  });

  it("keeps the previous image visible while a new source loads", async () => {
    const firstImage = createImage("first");
    const secondImage = createImage("second");
    let resolveSecondImage!: (image: HTMLImageElement | null) => void;

    vi.mocked(getCachedRenderableImageElement).mockReturnValue(null);
    vi.mocked(loadRenderableImageElement).mockImplementation((source) => {
      if (source === "first.png") {
        return Promise.resolve(firstImage);
      }

      return new Promise((resolve) => {
        resolveSecondImage = resolve;
      });
    });

    const { rerender } = render(<ImageProbe src="first.png" />);

    await waitFor(() => expect(screen.getByTestId("image").textContent).toBe("first"));

    rerender(<ImageProbe src="second.png" />);

    expect(screen.getByTestId("image").textContent).toBe("first");

    resolveSecondImage(secondImage);

    await waitFor(() => expect(screen.getByTestId("image").textContent).toBe("second"));
  });
});
