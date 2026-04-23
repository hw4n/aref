function getFileStem(path: string) {
  const filename = path.split(/[\\/]/).at(-1) ?? path;
  return filename.replace(/\.[^.]+$/, "") || filename;
}

export function getProjectDisplayName(projectName: string, currentProjectPath: string | null) {
  const normalizedProjectName = projectName.trim();

  if (normalizedProjectName && normalizedProjectName !== "Untitled Board") {
    return normalizedProjectName;
  }

  if (currentProjectPath) {
    return getFileStem(currentProjectPath);
  }

  return normalizedProjectName || "Untitled Board";
}
