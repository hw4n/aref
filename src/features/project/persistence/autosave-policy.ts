export const AUTOSAVE_USER_IDLE_MS = 60_000;
export const AUTOSAVE_HIDDEN_DOCUMENT_DELAY_MS = 3_000;
export const AUTOSAVE_ACTIVITY_SIGNAL_THROTTLE_MS = 1_000;

export function getAutosaveDelayMs({
  isDocumentHidden,
  lastUserActivityAt,
  now,
}: {
  isDocumentHidden: boolean;
  lastUserActivityAt: number;
  now: number;
}) {
  if (isDocumentHidden) {
    return AUTOSAVE_HIDDEN_DOCUMENT_DELAY_MS;
  }

  return Math.max(0, lastUserActivityAt + AUTOSAVE_USER_IDLE_MS - now);
}
