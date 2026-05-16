import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyProject } from "@/domain/project/sample-project";
import { appStore } from "@/state/app-store";

import {
  listRecentProjects,
  loadStartupProject,
  saveAutosaveProject,
} from "./project-io";
import { useProjectPersistence } from "./use-project-persistence";

vi.mock("./tauri-runtime", () => ({
  hasTauriRuntime: () => true,
}));

vi.mock("./project-io", () => ({
  chooseOpenProjectPath: vi.fn(),
  chooseSaveProjectPath: vi.fn(),
  listRecentProjects: vi.fn(),
  loadProjectFromPath: vi.fn(),
  loadStartupProject: vi.fn(),
  saveAutosaveProject: vi.fn(),
  saveProjectToPath: vi.fn(),
}));

function PersistenceProbe() {
  const persistence = useProjectPersistence();

  return <div data-testid="ready">{persistence.isReady ? "ready" : "loading"}</div>;
}

async function renderPersistenceProbe() {
  render(<PersistenceProbe />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(screen.getByTestId("ready")).toHaveTextContent("ready");
}

function touchProject(updatedAt: string) {
  const project = appStore.getState().project;

  appStore.getState().replaceProject({
    ...project,
    name: `${project.name} updated`,
    updatedAt,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-16T00:00:00.000Z"));
  vi.mocked(loadStartupProject).mockResolvedValue(null);
  vi.mocked(listRecentProjects).mockResolvedValue([]);
  vi.mocked(saveAutosaveProject).mockResolvedValue(undefined);
  appStore.getState().replaceProject(createEmptyProject());
  appStore.getState().setCanvasInteractionActive(false);
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("useProjectPersistence autosave scheduling", () => {
  it("waits until one minute of user idle time before autosaving", async () => {
    await renderPersistenceProbe();

    act(() => {
      touchProject("2026-05-16T00:00:00.001Z");
    });

    await act(async () => {
      vi.advanceTimersByTime(59_000);
      await Promise.resolve();
    });
    expect(saveAutosaveProject).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
    });
    expect(saveAutosaveProject).toHaveBeenCalledTimes(1);
  });

  it("reschedules autosave when user activity continues before the idle window", async () => {
    await renderPersistenceProbe();

    act(() => {
      touchProject("2026-05-16T00:00:00.001Z");
    });

    await act(async () => {
      vi.advanceTimersByTime(59_000);
      window.dispatchEvent(new Event("pointermove"));
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
    });
    expect(saveAutosaveProject).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(59_000);
      await Promise.resolve();
    });
    expect(saveAutosaveProject).toHaveBeenCalledTimes(1);
  });

  it("does not autosave while canvas interaction is active", async () => {
    await renderPersistenceProbe();

    act(() => {
      appStore.getState().setCanvasInteractionActive(true);
      touchProject("2026-05-16T00:00:00.001Z");
    });

    await act(async () => {
      vi.advanceTimersByTime(120_000);
      await Promise.resolve();
    });
    expect(saveAutosaveProject).not.toHaveBeenCalled();

    act(() => {
      appStore.getState().setCanvasInteractionActive(false);
    });
    await act(async () => {
      vi.runOnlyPendingTimers();
      await Promise.resolve();
    });
    expect(saveAutosaveProject).toHaveBeenCalledTimes(1);
  });
});
