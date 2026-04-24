import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  AlertIcon,
  BoardIcon,
  CancelIcon,
  CenterSelectionIcon,
  CheckCircleIcon,
  CodeIcon,
  FitSelectionIcon,
  FrameAllIcon,
  ImportIcon,
  RecentIcon,
  ResetZoomIcon,
  SettingsIcon,
  SourceIcon,
  SparklesIcon,
  TerminalIcon,
} from "@/components/icons/ui-icons";
import {
  isProviderAvailabilitySelectable,
  orderProviderAuthMethods,
} from "@/domain/providers/provider-management";
import type {
  Ima2SidecarSettingsSnapshot,
  OpenAiSettingsSnapshot,
  ProviderAuthMethod,
  ProviderAvailabilityDescriptor,
} from "@/domain/providers/types";
import type { SettingsSurfaceSection } from "@/domain/ui/types";
import type { ProviderFamilyEntry } from "@/features/providers/use-provider-management";
import { useAppStore } from "@/state/app-store";

interface LeftSidebarProps {
  isImporting: boolean;
  onImportClick: () => void;
  providerEntries: ProviderFamilyEntry[];
  openAiAuthMethod: ProviderAuthMethod;
  openAiAvailabilityByMethod: Record<ProviderAuthMethod, ProviderAvailabilityDescriptor>;
  openAiSettings: OpenAiSettingsSnapshot;
  openAiSettingsStatus: "idle" | "loading" | "saving" | "error";
  openAiSettingsError: string | null;
  isDesktopOpenAiAvailable: boolean;
  saveOpenAiSettings: (input: {
    apiKey?: string;
    organizationId?: string;
    projectId?: string;
    baseUrl?: string;
  }) => Promise<OpenAiSettingsSnapshot | null>;
  clearOpenAiSettings: () => Promise<OpenAiSettingsSnapshot | null>;
  ima2SidecarSettings: Ima2SidecarSettingsSnapshot;
  ima2SidecarSettingsStatus: "idle" | "loading" | "saving" | "error";
  ima2SidecarSettingsError: string | null;
  isDesktopIma2SidecarAvailable: boolean;
  saveIma2SidecarSettings: (input: { baseUrl?: string }) => Promise<Ima2SidecarSettingsSnapshot | null>;
  clearIma2SidecarSettings: () => Promise<Ima2SidecarSettingsSnapshot | null>;
  reloadIma2SidecarSettings: () => Promise<void>;
  startIma2SidecarProxy: () => Promise<Ima2SidecarSettingsSnapshot | null>;
  startIma2SidecarLogin: () => Promise<boolean>;
  selectProviderFamily: (familyId: "openai" | "mock") => void;
  setOpenAiAuthMethod: (authMethod: ProviderAuthMethod) => void;
}

function ProviderStatePill({ availability }: { availability: ProviderAvailabilityDescriptor }) {
  const icon =
    availability.state === "available"
      ? <CheckCircleIcon size={13} />
      : availability.state === "disabled"
        ? <CancelIcon size={13} />
        : <AlertIcon size={13} />;

  return (
    <span className={`provider-state-pill provider-state-pill--${availability.tone}`}>
      {icon}
      <strong>{availability.label}</strong>
    </span>
  );
}

function SettingTabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`settings-tab ${active ? "settings-tab--active" : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function LeftSidebar({
  isImporting,
  onImportClick,
  providerEntries,
  openAiAuthMethod,
  openAiAvailabilityByMethod,
  openAiSettings,
  openAiSettingsStatus,
  openAiSettingsError,
  isDesktopOpenAiAvailable,
  saveOpenAiSettings,
  clearOpenAiSettings,
  ima2SidecarSettings,
  ima2SidecarSettingsStatus,
  ima2SidecarSettingsError,
  isDesktopIma2SidecarAvailable,
  saveIma2SidecarSettings,
  clearIma2SidecarSettings,
  reloadIma2SidecarSettings,
  startIma2SidecarProxy,
  startIma2SidecarLogin,
  selectProviderFamily,
  setOpenAiAuthMethod,
}: LeftSidebarProps) {
  const frameAll = useAppStore((state) => state.frameAll);
  const frameSelection = useAppStore((state) => state.frameSelection);
  const centerSelection = useAppStore((state) => state.centerSelection);
  const resetZoom = useAppStore((state) => state.resetZoom);
  const selectionCount = useAppStore((state) => state.project.selection.assetIds.length);
  const uiPreferences = useAppStore((state) => state.uiPreferences);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const setSettingsSection = useAppStore((state) => state.setSettingsSection);
  const setDeveloperMode = useAppStore((state) => state.setDeveloperMode);
  const setLogsVisible = useAppStore((state) => state.setLogsVisible);
  const setMockProviderEnabled = useAppStore((state) => state.setMockProviderEnabled);
  const appendDiagnosticLog = useAppStore((state) => state.appendDiagnosticLog);
  const clearDiagnosticLogs = useAppStore((state) => state.clearDiagnosticLogs);
  const pushToast = useAppStore((state) => state.pushToast);
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [openAiOrganizationId, setOpenAiOrganizationId] = useState("");
  const [openAiProjectId, setOpenAiProjectId] = useState("");
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState(openAiSettings.baseUrl);
  const [ima2SidecarBaseUrl, setIma2SidecarBaseUrl] = useState(ima2SidecarSettings.baseUrl);
  const [oauthFlowState, setOauthFlowState] = useState<"idle" | "starting" | "waiting" | "ready" | "error">("idle");

  useEffect(() => {
    setOpenAiOrganizationId(openAiSettings.organizationId ?? "");
    setOpenAiProjectId(openAiSettings.projectId ?? "");
    setOpenAiBaseUrl(openAiSettings.baseUrl);
  }, [openAiSettings.baseUrl, openAiSettings.organizationId, openAiSettings.projectId]);

  useEffect(() => {
    setIma2SidecarBaseUrl(ima2SidecarSettings.baseUrl);
  }, [ima2SidecarSettings.baseUrl]);

  const actions = [
    {
      label: isImporting ? "Importing" : "Import",
      icon: <ImportIcon size={18} />,
      onClick: onImportClick,
      disabled: false,
    },
    {
      label: "Frame All",
      icon: <FrameAllIcon size={18} />,
      onClick: frameAll,
      disabled: false,
    },
    {
      label: "Fit Selection",
      icon: <FitSelectionIcon size={18} />,
      onClick: frameSelection,
      disabled: selectionCount === 0,
    },
    {
      label: "Center",
      icon: <CenterSelectionIcon size={18} />,
      onClick: centerSelection,
      disabled: selectionCount === 0,
    },
    {
      label: "Reset Zoom",
      icon: <ResetZoomIcon size={18} />,
      onClick: resetZoom,
      disabled: false,
    },
  ];

  const activeProviderEntry = providerEntries.find((entry) => entry.active) ?? providerEntries[0] ?? null;
  const orderedAuthMethods = useMemo(
    () => orderProviderAuthMethods(["oauth", "api-key"]),
    [],
  );
  const oauthNeedsLogin = ima2SidecarSettings.oauthStatus === "auth_required"
    || ima2SidecarSettings.codexAuthStatus === "unauthed"
    || ima2SidecarSettings.codexAuthStatus === "missing";
  const oauthReady = ima2SidecarSettings.oauthStatus === "ready";
  const oauthBusy = ima2SidecarSettingsStatus === "loading"
    || ima2SidecarSettingsStatus === "saving"
    || oauthFlowState === "starting"
    || oauthFlowState === "waiting";
  const oauthStatusTitle = oauthReady
    ? "Ready"
    : oauthNeedsLogin
      ? "Login needed"
      : "Not ready";
  const oauthPrimaryActionLabel = oauthReady
    ? "Ready"
    : oauthNeedsLogin
      ? "Log in"
      : oauthFlowState === "waiting"
        ? "Waiting"
        : "Retry";

  useEffect(() => {
    if (openAiAuthMethod !== "oauth" || oauthFlowState !== "waiting") {
      return;
    }

    if (oauthReady) {
      setOauthFlowState("ready");
      pushToast({
        kind: "success",
        title: "OAuth ready",
      });
      return;
    }

    const intervalId = window.setInterval(() => {
      void reloadIma2SidecarSettings();
    }, 2500);
    const timeoutId = window.setTimeout(() => {
      setOauthFlowState("idle");
      pushToast({
        kind: "info",
        title: "Login still needed",
      });
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [oauthFlowState, oauthReady, openAiAuthMethod, pushToast, reloadIma2SidecarSettings]);

  const handleOpenSettings = (section: SettingsSurfaceSection) => {
    setSettingsSection(section);
  };

  const handleOpenAiAuthMethodChange = (authMethod: ProviderAuthMethod) => {
    setOpenAiAuthMethod(authMethod);
    appendDiagnosticLog({
      level: "info",
      scope: "auth",
      title: "Authentication method changed",
      message: `OpenAI auth method switched to ${authMethod === "oauth" ? "OAuth" : "API Key"}.`,
    });
  };

  const handleSaveOpenAiSettings = async () => {
    const nextSnapshot = await saveOpenAiSettings({
      apiKey: openAiApiKey.trim() || undefined,
      organizationId: openAiOrganizationId.trim() || undefined,
      projectId: openAiProjectId.trim() || undefined,
      baseUrl: openAiBaseUrl.trim() || undefined,
    });

    if (!nextSnapshot) {
      return;
    }

    setOpenAiApiKey("");
    appendDiagnosticLog({
      level: "info",
      scope: "auth",
      title: "OpenAI API key settings saved",
      message: nextSnapshot.configured ? "OpenAI API key configuration is available." : "OpenAI API key configuration is incomplete.",
      details: nextSnapshot.configured ? `Source: ${nextSnapshot.source}.` : "No API key is configured yet.",
    });
    pushToast({
      kind: "success",
      title: "OpenAI settings saved",
      description: nextSnapshot.configured ? `Ready via ${nextSnapshot.source}.` : "OpenAI still needs credentials.",
    });
  };

  const handleClearOpenAiSettings = async () => {
    const nextSnapshot = await clearOpenAiSettings();

    if (!nextSnapshot) {
      return;
    }

    setOpenAiApiKey("");
    appendDiagnosticLog({
      level: "warning",
      scope: "auth",
      title: "OpenAI API key settings cleared",
      message: "Stored OpenAI API-key configuration was cleared.",
      details: nextSnapshot.configured ? "Environment configuration still exists." : null,
    });
    pushToast({
      kind: "info",
      title: "OpenAI settings cleared",
      description: nextSnapshot.configured ? "Environment configuration still exists." : "Stored credentials were removed.",
    });
  };

  const handleSaveIma2SidecarSettings = async () => {
    const nextSnapshot = await saveIma2SidecarSettings({
      baseUrl: ima2SidecarBaseUrl.trim() || undefined,
    });

    if (!nextSnapshot) {
      return;
    }

    appendDiagnosticLog({
      level: "info",
      scope: "auth",
      title: "OAuth settings saved",
      message: `OAuth bridge saved at ${nextSnapshot.baseUrl}.`,
      details: `Status: ${nextSnapshot.oauthStatus}.`,
    });
    pushToast({
      kind: "success",
      title: "OAuth settings saved",
      description: `${nextSnapshot.baseUrl} • ${nextSnapshot.oauthStatus}`,
    });
  };

  const handleClearIma2SidecarSettings = async () => {
    const nextSnapshot = await clearIma2SidecarSettings();

    if (!nextSnapshot) {
      return;
    }

    appendDiagnosticLog({
      level: "warning",
      scope: "auth",
      title: "OAuth settings reset",
      message: "OAuth bridge settings were reset to defaults.",
      details: `Base URL: ${nextSnapshot.baseUrl}.`,
    });
    pushToast({
      kind: "info",
      title: "OAuth settings reset",
      description: `Using ${nextSnapshot.baseUrl}.`,
    });
  };

  const handleStartIma2Proxy = async () => {
    const nextSnapshot = await startIma2SidecarProxy();

    if (!nextSnapshot) {
      return;
    }

    appendDiagnosticLog({
      level: nextSnapshot.available ? "info" : "warning",
      scope: "auth",
      title: "OAuth proxy started",
      message: `OAuth bridge start requested for ${nextSnapshot.baseUrl}.`,
      details: `Status: ${nextSnapshot.oauthStatus}.`,
    });
    pushToast({
      kind: nextSnapshot.available ? "success" : "info",
      title: "OAuth proxy started",
      description: nextSnapshot.oauthStatus,
    });
  };

  const handleStartIma2Login = async () => {
    const started = await startIma2SidecarLogin();

    if (!started) {
      return;
    }

    appendDiagnosticLog({
      level: "info",
      scope: "auth",
      title: "OAuth login started",
      message: "ChatGPT login flow was launched from the provider settings.",
      details: "Login pending.",
    });
    pushToast({
      kind: "info",
      title: "Login started",
      description: "Login pending.",
    });
  };

  const handlePrepareIma2OAuth = async () => {
    if (oauthReady) {
      void reloadIma2SidecarSettings();
      return;
    }

    setOauthFlowState("starting");

    if (oauthNeedsLogin) {
      const started = await startIma2SidecarLogin();

      if (!started) {
        setOauthFlowState("error");
        pushToast({
          kind: "error",
          title: "Login could not start",
        });
        return;
      }

      setOauthFlowState("waiting");
      pushToast({
        kind: "info",
        title: "Login opened",
      });
      window.setTimeout(() => {
        void reloadIma2SidecarSettings();
      }, 1500);
      return;
    }

    const nextSnapshot = await startIma2SidecarProxy();

    if (!nextSnapshot) {
      setOauthFlowState("error");
      return;
    }

    setOauthFlowState(nextSnapshot.oauthStatus === "ready" ? "ready" : "idle");
  };

  const handleDeveloperModeToggle = (enabled: boolean) => {
    setDeveloperMode(enabled);
    appendDiagnosticLog({
      level: "info",
      scope: "system",
      title: "Developer Mode changed",
      message: enabled ? "Developer Mode enabled." : "Developer Mode disabled.",
      details: enabled ? "Advanced diagnostics can now be shown." : "Diagnostics UI has been hidden.",
    });
  };

  const handleLogsVisibleToggle = (visible: boolean) => {
    setLogsVisible(visible);
    appendDiagnosticLog({
      level: "info",
      scope: "system",
      title: visible ? "Developer logs shown" : "Developer logs hidden",
      message: visible ? "Developer logs drawer was opened." : "Developer logs drawer was hidden.",
    });
  };

  const handleMockProviderToggle = (enabled: boolean) => {
    setMockProviderEnabled(enabled);
    appendDiagnosticLog({
      level: enabled ? "warning" : "info",
      scope: "provider",
      title: enabled ? "Mock provider enabled" : "Mock provider hidden",
      message: enabled
        ? "Mock provider is now selectable from the provider list."
        : "Mock provider has been hidden from the normal provider list.",
    });
  };

  return (
    <aside className="left-sidebar">
      <section className="left-sidebar__section">
        <header className="left-sidebar__section-header">
          <h2>Canvas</h2>
        </header>
        <div className="left-sidebar__actions">
          {actions.map((action) => (
            <button
              key={action.label}
              className="left-sidebar__action"
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="left-sidebar__section">
        <header className="left-sidebar__section-header">
          <h2>Providers</h2>
          <button className="left-sidebar__section-button" onClick={() => handleOpenSettings("providers")} title="Settings">
            <SettingsIcon size={14} />
          </button>
        </header>

        <div className="provider-list">
          {providerEntries.map((entry) => (
            <article
              key={entry.familyId}
              className={`provider-card ${entry.active ? "provider-card--active" : ""}`}
            >
              <div className="provider-card__body">
                <div className="provider-card__header">
                  <div>
                    <strong>{entry.label}</strong>
                  </div>
                  <ProviderStatePill availability={entry.availability} />
                </div>
              </div>
              <div className="provider-card__actions">
                <button
                  className={`provider-card__action ${entry.active ? "active" : ""}`}
                  disabled={!isProviderAvailabilitySelectable(entry.availability)}
                  onClick={() => selectProviderFamily(entry.familyId)}
                  title={entry.active ? "Active" : "Use"}
                >
                  <SparklesIcon size={14} />
                </button>
                <button
                  className="provider-card__action"
                  onClick={() => handleOpenSettings(entry.familyId === "mock" ? "developer" : "providers")}
                  title="Configure"
                >
                  <SettingsIcon size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="left-sidebar__section">
        <header className="left-sidebar__section-header">
          <h2>Settings</h2>
          <button
            className={`left-sidebar__section-button ${uiPreferences.settingsOpen ? 'active' : ''}`}
            onClick={() => setSettingsOpen(!uiPreferences.settingsOpen)}
            title={uiPreferences.settingsOpen ? "Close Settings" : "Open Settings"}
          >
            <SettingsIcon size={14} />
            <span>{uiPreferences.settingsOpen ? "Close" : "Open"}</span>
          </button>
        </header>

        {uiPreferences.settingsOpen ? (
          <div className="settings-surface">
            <div className="settings-surface__tabs">
              <SettingTabButton
                active={uiPreferences.settingsSection === "general"}
                icon={<BoardIcon size={14} />}
                label="General"
                onClick={() => handleOpenSettings("general")}
              />
              <SettingTabButton
                active={uiPreferences.settingsSection === "providers"}
                icon={<SourceIcon size={14} />}
                label="Providers"
                onClick={() => handleOpenSettings("providers")}
              />
              <SettingTabButton
                active={uiPreferences.settingsSection === "developer"}
                icon={<CodeIcon size={14} />}
                label="Developer"
                onClick={() => handleOpenSettings("developer")}
              />
            </div>

            {uiPreferences.settingsSection === "general" ? (
              <div className="settings-surface__content">
                <div className="settings-note">
                  <strong>Provider:</strong> <span>{activeProviderEntry?.label || "None"}</span>
                </div>
              </div>
            ) : null}

            {uiPreferences.settingsSection === "providers" ? (
              <div className="settings-surface__content">
                <label className="settings-field">
                  <span>Authentication</span>
                  <select
                    value={openAiAuthMethod}
                    onChange={(event) => handleOpenAiAuthMethodChange(event.currentTarget.value as ProviderAuthMethod)}
                  >
                    {orderedAuthMethods.map((authMethod) => (
                      <option key={authMethod} value={authMethod}>
                        {authMethod === "oauth" ? "OAuth" : "API Key"}
                      </option>
                    ))}
                  </select>
                </label>

                {openAiAuthMethod === "oauth" ? (
                  <>
                    <section className="oauth-card">
                      <strong>{oauthStatusTitle}</strong>

                      <button
                        className="settings-action settings-action--primary"
                        disabled={!isDesktopIma2SidecarAvailable || oauthBusy || oauthReady}
                        onClick={() => void handlePrepareIma2OAuth()}
                      >
                        <SparklesIcon size={14} />
                        <span>{oauthBusy ? "Working" : oauthPrimaryActionLabel}</span>
                      </button>
                    </section>

                    {uiPreferences.developerMode ? (
                      <details className="settings-advanced">
                        <summary>Advanced OAuth bridge</summary>

                        <label className="settings-field">
                          <span>Proxy URL</span>
                          <input
                            disabled={!isDesktopIma2SidecarAvailable}
                            placeholder="http://127.0.0.1:10531"
                            type="text"
                            value={ima2SidecarBaseUrl}
                            onChange={(event) => setIma2SidecarBaseUrl(event.currentTarget.value)}
                          />
                        </label>

                        <div className="settings-actions">
                          <button
                            className="settings-action"
                            disabled={!isDesktopIma2SidecarAvailable || ima2SidecarSettingsStatus === "saving"}
                            onClick={() => void handleSaveIma2SidecarSettings()}
                          >
                            <SparklesIcon size={14} />
                            <span>Save URL</span>
                          </button>
                          <button
                            className="settings-action"
                            disabled={!isDesktopIma2SidecarAvailable || ima2SidecarSettingsStatus === "saving"}
                            onClick={() => void handleStartIma2Proxy()}
                          >
                            <RecentIcon size={14} />
                            <span>Restart Bridge</span>
                          </button>
                          <button
                            className="settings-action"
                            disabled={!isDesktopIma2SidecarAvailable || ima2SidecarSettingsStatus === "saving"}
                            onClick={() => void handleStartIma2Login()}
                          >
                            <SourceIcon size={14} />
                            <span>Launch Login</span>
                          </button>
                          <button
                            className="settings-action"
                            disabled={!isDesktopIma2SidecarAvailable || ima2SidecarSettingsStatus === "loading"}
                            onClick={() => void reloadIma2SidecarSettings()}
                          >
                            <SparklesIcon size={14} />
                            <span>Refresh</span>
                          </button>
                          <button
                            className="settings-action"
                            disabled={!isDesktopIma2SidecarAvailable || ima2SidecarSettingsStatus === "saving"}
                            onClick={() => void handleClearIma2SidecarSettings()}
                          >
                            <CancelIcon size={14} />
                            <span>Reset</span>
                          </button>
                        </div>
                      </details>
                    ) : null}

                    {ima2SidecarSettingsError ? (
                      <p className="settings-error">{ima2SidecarSettingsError}</p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <label className="settings-field">
                      <span>API Key</span>
                      <input
                        autoComplete="off"
                        disabled={!isDesktopOpenAiAvailable}
                        placeholder={
                          openAiSettings.apiKeyLast4 ? `Stored •••• ${openAiSettings.apiKeyLast4}` : "sk-..."
                        }
                        type="password"
                        value={openAiApiKey}
                        onChange={(event) => setOpenAiApiKey(event.currentTarget.value)}
                      />
                    </label>
                    <label className="settings-field">
                      <span>Org</span>
                      <input
                        disabled={!isDesktopOpenAiAvailable}
                        placeholder="Optional"
                        type="text"
                        value={openAiOrganizationId}
                        onChange={(event) => setOpenAiOrganizationId(event.currentTarget.value)}
                      />
                    </label>
                    <label className="settings-field">
                      <span>Project</span>
                      <input
                        disabled={!isDesktopOpenAiAvailable}
                        placeholder="Optional"
                        type="text"
                        value={openAiProjectId}
                        onChange={(event) => setOpenAiProjectId(event.currentTarget.value)}
                      />
                    </label>
                    <label className="settings-field">
                      <span>Base URL</span>
                      <input
                        disabled={!isDesktopOpenAiAvailable}
                        placeholder="https://api.openai.com/v1"
                        type="text"
                        value={openAiBaseUrl}
                        onChange={(event) => setOpenAiBaseUrl(event.currentTarget.value)}
                      />
                    </label>

                    <div className="settings-actions">
                      <button
                        className="settings-action"
                        disabled={!isDesktopOpenAiAvailable || openAiSettingsStatus === "saving"}
                        onClick={() => void handleSaveOpenAiSettings()}
                      >
                        <SparklesIcon size={14} />
                        <span>Save</span>
                      </button>
                      <button
                        className="settings-action"
                        disabled={!isDesktopOpenAiAvailable || openAiSettingsStatus === "saving"}
                        onClick={() => void handleClearOpenAiSettings()}
                      >
                        <CancelIcon size={14} />
                        <span>Clear</span>
                      </button>
                    </div>

                    {openAiSettingsError ? <p className="settings-error">{openAiSettingsError}</p> : null}
                  </>
                )}
              </div>
            ) : null}

            {uiPreferences.settingsSection === "developer" ? (
              <div className="settings-surface__content">
                <label className="toggle-row">
                  <span>
                    <strong>Developer Mode</strong>
                    <em>Expose advanced diagnostics and development-only controls.</em>
                  </span>
                  <input
                    checked={uiPreferences.developerMode}
                    type="checkbox"
                    onChange={(event) => handleDeveloperModeToggle(event.currentTarget.checked)}
                  />
                </label>

                <label className="toggle-row">
                  <span>
                    <strong>Show Logs</strong>
                    <em>Open the bottom diagnostics drawer when Developer Mode is on.</em>
                  </span>
                  <input
                    checked={uiPreferences.logsVisible}
                    disabled={!uiPreferences.developerMode}
                    type="checkbox"
                    onChange={(event) => handleLogsVisibleToggle(event.currentTarget.checked)}
                  />
                </label>

                <label className="toggle-row">
                  <span>
                    <strong>Show Mock Provider</strong>
                    <em>Make the mock generation provider visible and selectable.</em>
                  </span>
                  <input
                    checked={uiPreferences.mockProviderEnabled}
                    disabled={!uiPreferences.developerMode}
                    type="checkbox"
                    onChange={(event) => handleMockProviderToggle(event.currentTarget.checked)}
                  />
                </label>

                <div className="settings-actions">
                  <button
                    className="settings-action"
                    disabled={!uiPreferences.developerMode}
                    onClick={clearDiagnosticLogs}
                  >
                    <TerminalIcon size={14} />
                    <span>Clear Logs</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </aside>
  );
}
