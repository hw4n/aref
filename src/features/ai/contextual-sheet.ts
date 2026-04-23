export function shouldShowContextualGenerationSheet(
  selectionCount: number,
  isExplicitlyOpened: boolean,
) {
  return selectionCount > 0 || isExplicitlyOpened;
}
