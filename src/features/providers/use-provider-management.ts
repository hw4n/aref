import { useEffect, useMemo, useRef } from "react";

import {
  getResolvedOpenAiAuthMethod,
  mapMockProviderAvailability,
  mapOpenAiApiKeyAvailability,
  mapOpenAiOAuthAvailability,
  orderProviderAuthMethods,
  resolveOpenAiConcreteProvider,
  shouldAutoStartOAuthProxy,
  shouldPollOAuthSettings,
} from "@/domain/providers/provider-management";
import type {
  GenerationProviderAdapter,
  ProviderAuthMethod,
  ProviderAvailabilityDescriptor,
  ProviderFamilyId,
} from "@/domain/providers/types";
import { useIma2SidecarSettings } from "@/features/ai/ima2-sidecar/use-ima2-sidecar-settings";
import { useOpenAiSettings } from "@/features/ai/openai/use-openai-settings";
import { useAppStore } from "@/state/app-store";

import { listGenerationProviders } from "@/services/providers/provider-registry";

export interface ProviderFamilyEntry {
  familyId: ProviderFamilyId;
  label: string;
  description: string;
  active: boolean;
  concreteProviderId: string;
  availability: ProviderAvailabilityDescriptor;
  authMethods?: ProviderAuthMethod[];
  authMethod?: ProviderAuthMethod;
  devOnly?: boolean;
}

function selectProviderAdapter(providerId: string, providers: GenerationProviderAdapter[]) {
  return providers.find((provider) => provider.id === providerId) ?? null;
}

export function useProviderManagement() {
  const providers = useMemo(() => listGenerationProviders(), []);
  const generationDraft = useAppStore((state) => state.generationDraft);
  const uiPreferences = useAppStore((state) => state.uiPreferences);
  const appendDiagnosticLog = useAppStore((state) => state.appendDiagnosticLog);
  const setGenerationDraft = useAppStore((state) => state.setGenerationDraft);
  const setProviderAuthMethod = useAppStore((state) => state.setProviderAuthMethod);
  const {
    snapshot: openAiSettings,
    status: openAiSettingsStatus,
    error: openAiSettingsError,
    isDesktop: isDesktopOpenAiAvailable,
    reload: reloadOpenAiSettings,
    save: saveOpenAiSettings,
    clear: clearOpenAiSettings,
  } = useOpenAiSettings();
  const {
    snapshot: ima2SidecarSettings,
    status: ima2SidecarSettingsStatus,
    error: ima2SidecarSettingsError,
    isDesktop: isDesktopIma2SidecarAvailable,
    reload: reloadIma2SidecarSettings,
    save: saveIma2SidecarSettings,
    clear: clearIma2SidecarSettings,
    startProxy: startIma2SidecarProxy,
    startLogin: startIma2SidecarLogin,
  } = useIma2SidecarSettings();

  const openAiAuthMethod = uiPreferences.providerAuthMethods.openai ?? "oauth";
  const openAiAvailabilityByMethod = useMemo(
    () => ({
      oauth: mapOpenAiOAuthAvailability({
        snapshot: ima2SidecarSettings,
        isDesktop: isDesktopIma2SidecarAvailable,
        status: ima2SidecarSettingsStatus,
        error: ima2SidecarSettingsError,
      }),
      "api-key": mapOpenAiApiKeyAvailability({
        snapshot: openAiSettings,
        isDesktop: isDesktopOpenAiAvailable,
        status: openAiSettingsStatus,
        error: openAiSettingsError,
      }),
    }),
    [
      ima2SidecarSettings,
      ima2SidecarSettingsError,
      ima2SidecarSettingsStatus,
      isDesktopIma2SidecarAvailable,
      isDesktopOpenAiAvailable,
      openAiSettings,
      openAiSettingsError,
      openAiSettingsStatus,
    ],
  );
  const orderedOpenAiAuthMethods = useMemo(
    () => orderProviderAuthMethods(["oauth", "api-key"]),
    [],
  );
  const openAiLoadingByMethod = useMemo(
    () => ({
      oauth: ima2SidecarSettingsStatus === "loading",
      "api-key": openAiSettingsStatus === "loading",
    }),
    [ima2SidecarSettingsStatus, openAiSettingsStatus],
  );
  const openAiResolvedMethod = useMemo(
    () => getResolvedOpenAiAuthMethod(openAiAuthMethod, openAiAvailabilityByMethod, openAiLoadingByMethod),
    [openAiAuthMethod, openAiAvailabilityByMethod, openAiLoadingByMethod],
  );
  const openAiConcreteProviderId = resolveOpenAiConcreteProvider(openAiResolvedMethod);
  const mockAvailability = useMemo(
    () => mapMockProviderAvailability(uiPreferences.mockProviderEnabled),
    [uiPreferences.mockProviderEnabled],
  );
  const providerEntries = useMemo<ProviderFamilyEntry[]>(() => {
    const entries: ProviderFamilyEntry[] = [
      {
        familyId: "openai",
        label: "OpenAI",
        description: openAiResolvedMethod === "oauth" ? "OAuth" : "API Key",
        active: generationDraft.provider === "openai" || generationDraft.provider === "ima2-sidecar",
        concreteProviderId: openAiConcreteProviderId,
        availability: openAiAvailabilityByMethod[openAiResolvedMethod],
        authMethods: orderedOpenAiAuthMethods,
        authMethod: openAiResolvedMethod,
      },
    ];

    if (uiPreferences.mockProviderEnabled) {
      entries.push({
        familyId: "mock",
        label: "Mock / Dev",
        description: "Development only",
        active: generationDraft.provider === "mock",
        concreteProviderId: "mock",
        availability: mockAvailability,
        devOnly: true,
      });
    }

    return entries;
  }, [
    generationDraft.provider,
    mockAvailability,
    openAiAvailabilityByMethod,
    openAiConcreteProviderId,
    openAiResolvedMethod,
    orderedOpenAiAuthMethods,
    uiPreferences.mockProviderEnabled,
  ]);

  const activeProvider = useMemo(
    () => selectProviderAdapter(generationDraft.provider, providers),
    [generationDraft.provider, providers],
  );
  const availabilitySignatureRef = useRef<string | null>(null);
  const oauthAutoStartSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isDesktopIma2SidecarAvailable) {
      oauthAutoStartSignatureRef.current = null;
      return;
    }

    if (!shouldAutoStartOAuthProxy({
      snapshot: ima2SidecarSettings,
      isDesktop: isDesktopIma2SidecarAvailable,
      status: ima2SidecarSettingsStatus,
    })) {
      return;
    }

    const signature = [
      ima2SidecarSettings.baseUrl,
      ima2SidecarSettings.oauthStatus,
      ima2SidecarSettings.codexAuthStatus,
    ].join("|");

    if (oauthAutoStartSignatureRef.current === signature) {
      return;
    }

    oauthAutoStartSignatureRef.current = signature;
    void startIma2SidecarProxy();
  }, [
    ima2SidecarSettings.baseUrl,
    ima2SidecarSettings.codexAuthStatus,
    ima2SidecarSettings.oauthStatus,
    ima2SidecarSettings.proxyManaged,
    ima2SidecarSettingsStatus,
    isDesktopIma2SidecarAvailable,
    startIma2SidecarProxy,
  ]);

  useEffect(() => {
    if (!shouldPollOAuthSettings({
      snapshot: ima2SidecarSettings,
      isDesktop: isDesktopIma2SidecarAvailable,
      status: ima2SidecarSettingsStatus,
    })) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void reloadIma2SidecarSettings();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [
    ima2SidecarSettings.codexAuthStatus,
    ima2SidecarSettings.oauthStatus,
    ima2SidecarSettings.proxyManaged,
    ima2SidecarSettingsStatus,
    isDesktopIma2SidecarAvailable,
    reloadIma2SidecarSettings,
  ]);

  useEffect(() => {
    const signature = JSON.stringify({
      openAi: openAiAvailabilityByMethod["api-key"],
      oauth: openAiAvailabilityByMethod.oauth,
      mock: mockAvailability,
    });

    if (availabilitySignatureRef.current === signature) {
      return;
    }

    availabilitySignatureRef.current = signature;
    appendDiagnosticLog({
      level: "info",
      scope: "provider",
      title: "Provider availability refreshed",
      message: `OpenAI OAuth: ${openAiAvailabilityByMethod.oauth.label}. OpenAI API Key: ${openAiAvailabilityByMethod["api-key"].label}. Mock: ${mockAvailability.label}.`,
      details: [
        openAiAvailabilityByMethod.oauth.reason,
        openAiAvailabilityByMethod["api-key"].reason,
        mockAvailability.reason,
      ].join(" | "),
    });
  }, [appendDiagnosticLog, mockAvailability, openAiAvailabilityByMethod]);

  useEffect(() => {
    if (generationDraft.provider === "mock" && !uiPreferences.mockProviderEnabled) {
      const fallbackProviderId = resolveOpenAiConcreteProvider(openAiResolvedMethod);
      const fallbackProvider = selectProviderAdapter(fallbackProviderId, providers);

      setGenerationDraft({
        provider: fallbackProviderId,
        model: fallbackProvider?.defaultModel ?? generationDraft.model,
      });
      appendDiagnosticLog({
        level: "warning",
        scope: "provider",
        title: "Provider fallback applied",
        message: "Mock provider was hidden, so the active provider switched to OpenAI.",
        details: `Fallback auth method: ${openAiResolvedMethod}.`,
      });
    }
  }, [
    appendDiagnosticLog,
    generationDraft.model,
    generationDraft.provider,
    openAiResolvedMethod,
    providers,
    setGenerationDraft,
    uiPreferences.mockProviderEnabled,
  ]);

  useEffect(() => {
    if (generationDraft.provider === "openai" || generationDraft.provider === "ima2-sidecar") {
      const expectedProviderId = resolveOpenAiConcreteProvider(openAiResolvedMethod);

      if (expectedProviderId !== generationDraft.provider) {
        const provider = selectProviderAdapter(expectedProviderId, providers);
        setGenerationDraft({
          provider: expectedProviderId,
          model: provider?.defaultModel ?? generationDraft.model,
        });
      }
    }
  }, [generationDraft.model, generationDraft.provider, openAiResolvedMethod, providers, setGenerationDraft]);

  const selectProviderFamily = (familyId: ProviderFamilyId) => {
    if (familyId === "mock") {
      if (!uiPreferences.mockProviderEnabled) {
        return;
      }

      const provider = selectProviderAdapter("mock", providers);
      setGenerationDraft({
        provider: "mock",
        model: provider?.defaultModel ?? generationDraft.model,
      });
      return;
    }

    const nextMethod = getResolvedOpenAiAuthMethod(openAiAuthMethod, openAiAvailabilityByMethod, openAiLoadingByMethod);
    const nextProviderId = resolveOpenAiConcreteProvider(nextMethod);
    const provider = selectProviderAdapter(nextProviderId, providers);

    setProviderAuthMethod("openai", nextMethod);
    setGenerationDraft({
      provider: nextProviderId,
      model: provider?.defaultModel ?? generationDraft.model,
    });
  };

  const setOpenAiAuthMethod = (authMethod: ProviderAuthMethod) => {
    setProviderAuthMethod("openai", authMethod);

    if (generationDraft.provider === "openai" || generationDraft.provider === "ima2-sidecar") {
      const nextProviderId = resolveOpenAiConcreteProvider(authMethod);
      const provider = selectProviderAdapter(nextProviderId, providers);
      setGenerationDraft({
        provider: nextProviderId,
        model: provider?.defaultModel ?? generationDraft.model,
      });
    }
  };

  return {
    activeProvider,
    providerEntries,
    openAiAuthMethod,
    openAiAvailabilityByMethod,
    openAiSettings,
    openAiSettingsError,
    openAiSettingsStatus,
    isDesktopOpenAiAvailable,
    reloadOpenAiSettings,
    saveOpenAiSettings,
    clearOpenAiSettings,
    ima2SidecarSettings,
    ima2SidecarSettingsError,
    ima2SidecarSettingsStatus,
    isDesktopIma2SidecarAvailable,
    reloadIma2SidecarSettings,
    saveIma2SidecarSettings,
    clearIma2SidecarSettings,
    startIma2SidecarProxy,
    startIma2SidecarLogin,
    selectProviderFamily,
    setOpenAiAuthMethod,
  };
}
