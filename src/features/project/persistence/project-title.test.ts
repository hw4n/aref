import { describe, expect, it } from "vitest";

import { getProjectDisplayName } from "@/features/project/persistence/project-title";

describe("getProjectDisplayName", () => {
  it("falls back to the saved filename when the project still has the default name", () => {
    expect(getProjectDisplayName("Untitled Board", "/tmp/boards/board2.aref")).toBe("board2");
  });

  it("preserves a custom project name over the file name", () => {
    expect(getProjectDisplayName("Mood Board", "/tmp/boards/board2.aref")).toBe("Mood Board");
  });
});
