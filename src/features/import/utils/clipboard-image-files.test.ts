import { describe, expect, it } from "vitest";

import {
  type ClipboardDataLike,
  dataUrlToClipboardFile,
  extractImageDataUrlsFromHtml,
  getClipboardImageFiles,
} from "./clipboard-image-files";

describe("clipboard image files", () => {
  it("extracts image data urls from pasted html", () => {
    const urls = extractImageDataUrlsFromHtml(`
      <div>
        <img src="data:image/png;base64,aGVsbG8=" />
        <img src="https://example.com/not-imported.png" />
      </div>
    `);

    expect(urls).toEqual(["data:image/png;base64,aGVsbG8="]);
  });

  it("converts image data urls into clipboard files", async () => {
    const file = dataUrlToClipboardFile("data:image/png;base64,aGVsbG8=", 0);

    expect(file).not.toBeNull();
    expect(file?.type).toBe("image/png");
    expect(file?.name.endsWith(".png")).toBe(true);
    expect(file?.size).toBe(5);
  });

  it("prefers native clipboard image items when present", () => {
    const clipboardData: ClipboardDataLike = {
      items: [
        {
          kind: "file",
          type: "image/png",
          getAsFile: () => new File(["png"], "shot.png", { type: "image/png" }),
        },
      ],
      files: [],
      getData: () => "",
    };

    const files = getClipboardImageFiles(clipboardData);

    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe("shot.png");
  });

  it("falls back to pasted plain-text image data urls", () => {
    const clipboardData: ClipboardDataLike = {
      items: [],
      files: [],
      getData: (type: string) => (type === "text/plain" ? "data:image/png;base64,aGVsbG8=" : ""),
    };

    const files = getClipboardImageFiles(clipboardData);

    expect(files).toHaveLength(1);
    expect(files[0]?.type).toBe("image/png");
  });
});
