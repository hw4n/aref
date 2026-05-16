import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createEmptyProject } from "@/domain/project/sample-project";
import { appStore, useAppStore } from "@/state/app-store";

import {
  chooseOpenProjectPath,
  chooseSaveProjectPath,
  listRecentProjects,
  loadProjectFromPath,
  loadStartupProject,
  saveAutosaveProject,
  saveProjectToPath,
} from "./project-io";
import { hasTauriRuntime } from "./tauri-runtime";
import type { RecentProjectRecord } from "./types";
import {
  AUTOSAVE_ACTIVITY_SIGNAL_THROTTLE_MS,
  getAutosaveDelayMs,
} from "./autosave-policy";

type PersistenceStatus = "idle" | "loading" | "saving" | "saved" | "modified" | "error";

function createProjectFingerprint(projectId: string, updatedAt: string, assetCount: number) {
  return `${projectId}:${updatedAt}:${assetCount}`;
}

export function useProjectPersistence() {
  const project = useAppStore((state) => state.project);
  const isCanvasInteractionActive = useAppStore((state) => state.isCanvasInteractionActive);
  const replaceProject = useAppStore((state) => state.replaceProject);
  const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProjectRecord[]>([]);
  const [status, setStatus] = useState<PersistenceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [activitySignal, setActivitySignal] = useState(0);
  const lastAutosavedFingerprintRef = useRef<string | null>(null);
  const lastUserActivityAtRef = useRef(Date.now());
  const lastActivitySignalAtRef = useRef(0);
  const autosaveProjectSnapshotRef = useRef(project);
  const autosaveSnapshotFingerprintRef = useRef<string | null>(null);
  const projectRef = useRef(project);

  const projectAssetCount = useMemo(
    () => Object.keys(project.assets).length,
    [project.assets],
  );
  const projectFingerprint = useMemo(
    () => createProjectFingerprint(project.id, project.updatedAt, projectAssetCount),
    [project.id, project.updatedAt, projectAssetCount],
  );

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    if (autosaveSnapshotFingerprintRef.current === projectFingerprint) {
      return;
    }

    autosaveSnapshotFingerprintRef.current = projectFingerprint;
    autosaveProjectSnapshotRef.current = project;
  }, [project, projectFingerprint]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const pushActivitySignal = (now: number, force = false) => {
      if (!force && now - lastActivitySignalAtRef.current < AUTOSAVE_ACTIVITY_SIGNAL_THROTTLE_MS) {
        return;
      }

      lastActivitySignalAtRef.current = now;
      setActivitySignal((current) => (current + 1) % Number.MAX_SAFE_INTEGER);
    };
    const recordUserActivity = () => {
      const now = Date.now();
      lastUserActivityAtRef.current = now;
      if (appStore.getState().isCanvasInteractionActive) {
        return;
      }

      pushActivitySignal(now);
    };
    const recordVisibilityChange = () => {
      const now = Date.now();

      if (document.hidden) {
        pushActivitySignal(now, true);
        return;
      }

      lastUserActivityAtRef.current = now;
      pushActivitySignal(now, true);
    };
    const options: AddEventListenerOptions = {
      capture: true,
      passive: true,
    };
    const activityEvents = ["keydown", "pointerdown", "pointermove", "touchstart", "wheel"] as const;

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, recordUserActivity, options);
    }
    document.addEventListener("visibilitychange", recordVisibilityChange);

    return () => {
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, recordUserActivity, options);
      }
      document.removeEventListener("visibilitychange", recordVisibilityChange);
    };
  }, []);

  const refreshRecentProjects = useCallback(async () => {
    if (!hasTauriRuntime()) {
      setRecentProjects([]);
      return;
    }

    const entries = await listRecentProjects();
    setRecentProjects(entries);
  }, []);

  const saveAutosaveSnapshot = useCallback(
    async (projectToSave: typeof project, projectPath: string | null, fingerprint: string) => {
      if (!hasTauriRuntime()) {
        return false;
      }

      if (fingerprint === lastAutosavedFingerprintRef.current) {
        return true;
      }

      try {
        setStatus("saving");
        await saveAutosaveProject(projectToSave, projectPath);
        lastAutosavedFingerprintRef.current = fingerprint;
        setError(null);
        setStatus("saved");
        return true;
      } catch (nextError) {
        setStatus("error");
        setError(nextError instanceof Error ? nextError.message : "Failed to autosave project.");
        return false;
      }
    },
    [],
  );

  const replaceProjectAndResetAutosave = useCallback(
    (nextProject: typeof project, nextProjectPath: string | null) => {
      replaceProject(nextProject);
      setCurrentProjectPath(nextProjectPath);
      lastAutosavedFingerprintRef.current = createProjectFingerprint(
        nextProject.id,
        nextProject.updatedAt,
        Object.keys(nextProject.assets).length,
      );
      setError(null);
      setStatus("idle");
    },
    [replaceProject],
  );

  const markProjectPersisted = useCallback(
    (path: string | null, nextRecentProjects?: RecentProjectRecord[]) => {
      lastAutosavedFingerprintRef.current = projectFingerprint;
      setCurrentProjectPath(path);
      if (nextRecentProjects) {
        setRecentProjects(nextRecentProjects);
      }
      setError(null);
      setStatus("saved");
    },
    [projectFingerprint],
  );

  const loadProjectAtPath = useCallback(
    async (path: string) => {
      setStatus("loading");
      const handle = await loadProjectFromPath(path);
      replaceProjectAndResetAutosave(handle.project, handle.path);
      await refreshRecentProjects();
      setStatus("saved");
    },
    [refreshRecentProjects, replaceProjectAndResetAutosave],
  );

  const createNewProject = useCallback(() => {
    replaceProjectAndResetAutosave(createEmptyProject(), null);
  }, [replaceProjectAndResetAutosave]);

  const openProject = useCallback(async () => {
      if (!hasTauriRuntime()) {
        return;
      }

    try {
      const path = await chooseOpenProjectPath();
      if (!path) {
        return;
      }

      await loadProjectAtPath(path);
    } catch (nextError) {
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Failed to open project.");
    }
  }, [loadProjectAtPath]);

  const openRecentProject = useCallback(
    async (path: string) => {
      try {
        await loadProjectAtPath(path);
      } catch (nextError) {
        setStatus("error");
        setError(nextError instanceof Error ? nextError.message : "Failed to open recent project.");
        await refreshRecentProjects();
      }
    },
    [loadProjectAtPath, refreshRecentProjects],
  );

  const saveProjectAs = useCallback(async () => {
    try {
      if (!hasTauriRuntime()) {
        return null;
      }

      const path = await chooseSaveProjectPath(project.name, currentProjectPath);
      if (!path) {
        return null;
      }

      setStatus("saving");
      const result = await saveProjectToPath(path, project);
      markProjectPersisted(result.path, result.recentProjects);
      return result.path;
    } catch (nextError) {
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Failed to save project.");
      return null;
    }
  }, [currentProjectPath, project]);

  const saveProject = useCallback(async () => {
    try {
      if (!hasTauriRuntime()) {
        return null;
      }

      if (!currentProjectPath) {
        return await saveProjectAs();
      }

      setStatus("saving");
      const result = await saveProjectToPath(currentProjectPath, project);
      markProjectPersisted(result.path, result.recentProjects);
      return result.path;
    } catch (nextError) {
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Failed to save project.");
      return null;
    }
  }, [currentProjectPath, markProjectPersisted, project, saveProjectAs]);

  const saveAutosaveNow = useCallback(async () => {
    if (!isReady) {
      return false;
    }

    const currentProject = appStore.getState().project;
    const currentFingerprint = createProjectFingerprint(
      currentProject.id,
      currentProject.updatedAt,
      Object.keys(currentProject.assets).length,
    );

    return saveAutosaveSnapshot(currentProject, currentProjectPath, currentFingerprint);
  }, [currentProjectPath, isReady, saveAutosaveSnapshot]);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      if (!hasTauriRuntime()) {
        const initialProject = projectRef.current;
        lastAutosavedFingerprintRef.current = createProjectFingerprint(
          initialProject.id,
          initialProject.updatedAt,
          Object.keys(initialProject.assets).length,
        );
        setIsReady(true);
        return;
      }

      try {
        const [startupHandle, recent] = await Promise.all([
          loadStartupProject(),
          listRecentProjects(),
        ]);

        if (!active) {
          return;
        }

        if (startupHandle) {
          replaceProjectAndResetAutosave(startupHandle.project, startupHandle.path);
        } else {
          const initialProject = projectRef.current;
          lastAutosavedFingerprintRef.current = createProjectFingerprint(
            initialProject.id,
            initialProject.updatedAt,
            Object.keys(initialProject.assets).length,
          );
        }

        setRecentProjects(recent);
        setError(null);
      } catch (nextError) {
        if (!active) {
          return;
        }

        setStatus("error");
        setError(nextError instanceof Error ? nextError.message : "Failed to load startup project.");
        const initialProject = projectRef.current;
        lastAutosavedFingerprintRef.current = createProjectFingerprint(
          initialProject.id,
          initialProject.updatedAt,
          Object.keys(initialProject.assets).length,
        );
      } finally {
        if (active) {
          setIsReady(true);
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, [refreshRecentProjects, replaceProjectAndResetAutosave]);

  useEffect(() => {
    if (!hasTauriRuntime() || !isReady || isCanvasInteractionActive) {
      return undefined;
    }

    if (projectFingerprint === lastAutosavedFingerprintRef.current) {
      return undefined;
    }

    const delayMs = getAutosaveDelayMs({
      isDocumentHidden: typeof document !== "undefined" ? document.hidden : false,
      lastUserActivityAt: lastUserActivityAtRef.current,
      now: Date.now(),
    });
    const timeoutId = window.setTimeout(async () => {
      const autosaveFingerprint = autosaveSnapshotFingerprintRef.current ?? projectFingerprint;

      if (autosaveFingerprint === lastAutosavedFingerprintRef.current) {
        return;
      }

      if (appStore.getState().isCanvasInteractionActive) {
        return;
      }

      const isDocumentHidden = typeof document !== "undefined" ? document.hidden : false;
      const remainingDelayMs = isDocumentHidden
        ? 0
        : getAutosaveDelayMs({
            isDocumentHidden,
            lastUserActivityAt: lastUserActivityAtRef.current,
            now: Date.now(),
          });

      if (remainingDelayMs > 0) {
        setActivitySignal((current) => (current + 1) % Number.MAX_SAFE_INTEGER);
        return;
      }

      await saveAutosaveSnapshot(
        autosaveProjectSnapshotRef.current,
        currentProjectPath,
        autosaveFingerprint,
      );
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [
    activitySignal,
    currentProjectPath,
    isCanvasInteractionActive,
    isReady,
    projectFingerprint,
    saveAutosaveSnapshot,
  ]);

  const effectiveStatus = useMemo<PersistenceStatus>(() => {
    if (
      isReady
      && (status === "idle" || status === "saved")
      && projectFingerprint !== lastAutosavedFingerprintRef.current
    ) {
      return "modified";
    }

    return status;
  }, [isReady, projectFingerprint, status]);

  return {
    currentProjectPath,
    error,
    isDesktopPersistenceAvailable: hasTauriRuntime(),
    isReady,
    recentProjects,
    status: effectiveStatus,
    createNewProject,
    openProject,
    openRecentProject,
    saveProject,
    saveProjectAs,
    saveAutosaveNow,
  };
}
