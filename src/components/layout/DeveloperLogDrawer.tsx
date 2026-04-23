import {
  CancelIcon,
  CheckCircleIcon,
  RetryIcon,
  SourceIcon,
  TerminalIcon,
} from "@/components/icons/ui-icons";
import type { ProviderRequestLogEntry } from "@/domain/providers/types";
import { useProviderRequestLogs } from "@/features/ai/provider-logs/use-provider-request-logs";
import { useAppStore } from "@/state/app-store";

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function ProviderRawLogCard({ entry }: { entry: ProviderRequestLogEntry }) {
  const status = entry.status ?? "unknown";

  return (
    <details className="provider-log-card">
      <summary className="provider-log-card__summary">
        <span className={`provider-log-card__status provider-log-card__status--${status}`}>
          <SourceIcon size={12} />
          <strong>{status}</strong>
        </span>
        <span className="provider-log-card__time">{entry.timestamp ? formatTimestamp(entry.timestamp) : "Unknown time"}</span>
      </summary>

      <div className="provider-log-card__meta">
        {entry.model ? <span>{entry.model}</span> : null}
        {entry.mode ? <span>{entry.mode}</span> : null}
        {typeof entry.referenceCount === "number" ? <span>{`${entry.referenceCount} refs`}</span> : null}
        {typeof entry.imageCount === "number" ? <span>{`${entry.imageCount} outputs`}</span> : null}
      </div>

      {entry.error ? <p className="provider-log-card__error">{entry.error}</p> : null}
      <pre className="provider-log-card__raw">{entry.rawJson}</pre>
    </details>
  );
}

export function DeveloperLogDrawer({ activeProviderId }: { activeProviderId: string | null }) {
  const uiPreferences = useAppStore((state) => state.uiPreferences);
  const diagnosticLogs = useAppStore((state) => state.diagnosticLogs);
  const setLogsVisible = useAppStore((state) => state.setLogsVisible);
  const clearDiagnosticLogs = useAppStore((state) => state.clearDiagnosticLogs);
  const {
    entries: providerLogEntries,
    error: providerLogsError,
    isDesktop: isDesktopProviderLogsAvailable,
    reload: reloadProviderLogs,
    status: providerLogsStatus,
    supportedProvider,
  } = useProviderRequestLogs(activeProviderId, 8);

  if (!uiPreferences.developerMode || !uiPreferences.logsVisible) {
    return null;
  }

  return (
    <section className="developer-log-drawer">
      <header className="developer-log-drawer__header">
        <div className="developer-log-drawer__title">
          <TerminalIcon size={15} />
          <div>
            <strong>Developer Logs</strong>
            <span>Structured app events and provider diagnostics</span>
          </div>
        </div>
        <div className="developer-log-drawer__actions">
          {supportedProvider ? (
            <button
              className="developer-log-drawer__action"
              disabled={!isDesktopProviderLogsAvailable || providerLogsStatus === "loading"}
              onClick={() => void reloadProviderLogs()}
            >
              <RetryIcon size={14} />
              <span>Refresh Raw Logs</span>
            </button>
          ) : null}
          <button className="developer-log-drawer__action" onClick={clearDiagnosticLogs}>
            <CheckCircleIcon size={14} />
            <span>Clear</span>
          </button>
          <button className="developer-log-drawer__action" onClick={() => setLogsVisible(false)}>
            <CancelIcon size={14} />
            <span>Hide</span>
          </button>
        </div>
      </header>

      <div className="developer-log-drawer__content">
        <section className="developer-log-drawer__pane">
          <header className="developer-log-drawer__pane-header">
            <strong>App Events</strong>
            <span>{`${diagnosticLogs.length} entries`}</span>
          </header>

          {diagnosticLogs.length > 0 ? (
            <div className="developer-log-drawer__event-list">
              {diagnosticLogs.map((entry) => (
                <article key={entry.id} className={`developer-log-entry developer-log-entry--${entry.level}`}>
                  <header className="developer-log-entry__header">
                    <span>{entry.scope}</span>
                    <span>{formatTimestamp(entry.timestamp)}</span>
                  </header>
                  <strong>{entry.title}</strong>
                  <p>{entry.message}</p>
                  {entry.details ? <pre>{entry.details}</pre> : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="developer-log-drawer__empty">
              <span>No app diagnostics yet</span>
            </div>
          )}
        </section>

        <section className="developer-log-drawer__pane">
          <header className="developer-log-drawer__pane-header">
            <strong>Raw Provider Logs</strong>
            <span>{supportedProvider ? supportedProvider : "Unavailable"}</span>
          </header>

          {!supportedProvider ? (
            <div className="developer-log-drawer__empty">
              <span>Raw provider logs appear when a real provider is active.</span>
            </div>
          ) : providerLogsError ? (
            <div className="developer-log-drawer__empty">
              <span>{providerLogsError}</span>
            </div>
          ) : !isDesktopProviderLogsAvailable ? (
            <div className="developer-log-drawer__empty">
              <span>Desktop only</span>
            </div>
          ) : providerLogEntries.length > 0 ? (
            <div className="developer-log-drawer__raw-list">
              {providerLogEntries.map((entry, index) => (
                <ProviderRawLogCard
                  key={`${entry.provider}-${entry.timestamp ?? "unknown"}-${entry.operationId ?? index}`}
                  entry={entry}
                />
              ))}
            </div>
          ) : (
            <div className="developer-log-drawer__empty">
              <span>{providerLogsStatus === "loading" ? "Loading raw logs" : "No raw logs yet"}</span>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
