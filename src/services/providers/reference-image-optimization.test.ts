import { describe, expect, it } from "vitest";

import { compressReferenceImagePayload } from "./reference-image-optimization";

describe("reference image optimization", () => {
  it("leaves small reference payloads unchanged", async () => {
    const payload = {
      filename: "reference.png",
      mimeType: "image/png",
      bytes: [1, 2, 3, 4],
      originalByteLength: 4,
    };

    await expect(compressReferenceImagePayload(payload, true)).resolves.toBe(payload);
  });

  it("leaves reference payloads unchanged when disabled", async () => {
    const payload = {
      filename: "reference.png",
      mimeType: "image/png",
      bytes: Array.from({ length: 1024 * 1024 }, () => 1),
      originalByteLength: 1024 * 1024,
    };

    await expect(compressReferenceImagePayload(payload, false)).resolves.toBe(payload);
  });
});
