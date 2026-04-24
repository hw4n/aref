import { describe, expect, it } from "vitest";

import {
  filterSupportedImageFiles,
  filterSupportedImagePaths,
  getFileNameFromPath,
  getImageMimeTypeFromName,
  isSupportedImageName,
} from "./image-file";

describe("image file detection", () => {
  it("detects supported images by Windows path extension", () => {
    expect(isSupportedImageName("C:\\Users\\artist\\Desktop\\ref.PNG")).toBe(true);
    expect(isSupportedImageName("C:\\Users\\artist\\Desktop\\notes.txt")).toBe(false);
  });

  it("extracts file names from Windows and POSIX paths", () => {
    expect(getFileNameFromPath("C:\\Users\\artist\\Desktop\\ref.png")).toBe("ref.png");
    expect(getFileNameFromPath("/home/artist/ref.webp")).toBe("ref.webp");
  });

  it("keeps files with missing MIME types when the extension is supported", () => {
    const files = [
      new File(["png"], "ref.png", { type: "" }),
      new File(["txt"], "notes.txt", { type: "" }),
      new File(["jpg"], "camera-upload", { type: "image/jpeg" }),
    ];

    expect(filterSupportedImageFiles(files).map((file) => file.name)).toEqual(["ref.png", "camera-upload"]);
  });

  it("filters dropped Tauri paths before import", () => {
    expect(filterSupportedImagePaths(["C:\\refs\\a.jpg", "C:\\refs\\a.psd", "/tmp/b.svg"])).toEqual([
      "C:\\refs\\a.jpg",
      "/tmp/b.svg",
    ]);
  });

  it("infers MIME types from file names", () => {
    expect(getImageMimeTypeFromName("ref.jpg")).toBe("image/jpeg");
    expect(getImageMimeTypeFromName("ref.svg")).toBe("image/svg+xml");
    expect(getImageMimeTypeFromName("ref.unknown")).toBe("image/png");
  });
});
