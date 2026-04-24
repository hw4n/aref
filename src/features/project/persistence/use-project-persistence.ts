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

const AUTOSAVE_DEBOUNCE_MS = 3000;

type PersistenceStatus = "idle" | "loading" | "saving" | "saved" | "error";

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
  const lastAutosavedFingerprintRef = useRef<string | null>(null);
  const autosaveProjectSnapshotRef = useRef(project);
  const autosaveSnapshotFingerprintRef = useRef<string | null>(null);
  const projectRef = useRef(project);

  const projectFingerprint = useMemo(
    () => createProjectFingerprint(project.id, project.updatedAt, Object.keys(project.assets).length),
    [project.assets, project.id, project.updatedAt],
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

  const refreshRecentProjects = useCallback(async () => {
    if (!hasTauriRuntime()) {
      setRecentProjects([]);
      return;
    }

    const entries = await listRecentProjects();
    setRecentProjects(entries);
  }, []);

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

    const autosaveProject = autosaveProjectSnapshotRef.current;
    const autosaveFingerprint = projectFingerprint;
    const timeoutId = window.setTimeout(async () => {
      if (autosaveFingerprint === lastAutosavedFingerprintRef.current) {
        return;
      }

      if (appStore.getState().isCanvasInteractionActive) {
        return;
      }

      try {
        setStatus("saving");
        await saveAutosaveProject(autosaveProject, currentProjectPath);
        lastAutosavedFingerprintRef.current = autosaveFingerprint;
        setError(null);
        setStatus("saved");
      } catch (nextError) {
        setStatus("error");
        setError(nextError instanceof Error ? nextError.message : "Failed to autosave project.");
      }
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [currentProjectPath, isCanvasInteractionActive, isReady, projectFingerprint]);

  return {
    currentProjectPath,
    error,
    isDesktopPersistenceAvailable: hasTauriRuntime(),
    isReady,
    recentProjects,
    status,
    createNewProject,
    openProject,
    openRecentProject,
    saveProject,
    saveProjectAs,
  };
}
