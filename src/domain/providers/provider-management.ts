import type {
  Ima2SidecarSettingsSnapshot,
  OpenAiSettingsSnapshot,
  ProviderAuthMethod,
  ProviderAvailabilityDescriptor,
  ProviderAvailabilityState,
} from "@/domain/providers/types";

export function orderProviderAuthMethods(methods: ProviderAuthMethod[]) {
  const priority: Record<ProviderAuthMethod, number> = {
    oauth: 0,
    "api-key": 1,
  };

  return [...new Set(methods)].sort((left, right) => priority[left] - priority[right]);
}

function createAvailability(
  state: ProviderAvailabilityState,
  label: string,
  reason: string,
): ProviderAvailabilityDescriptor {
  return {
    state,
    label,
    reason,
    tone:
      state === "available"
        ? "positive"
        : state === "auth-required"
          ? "warning"
          : state === "unavailable"
            ? "danger"
            : "muted",
  };
}

export function mapOpenAiApiKeyAvailability(options: {
  snapshot: OpenAiSettingsSnapshot;
  isDesktop: boolean;
  status: "idle" | "loading" | "saving" | "error";
  error: string | null;
}) {
  const { snapshot, isDesktop, status, error } = options;

  if (!isDesktop) {
    return createAvailability("unavailable", "Unavailable", "Desktop app required for local provider settings.");
  }

  if (error || status === "error") {
    return createAvailability("unavailable", "Unavailable", error ?? "OpenAI settings failed to load.");
  }

  if (!snapshot.available) {
    return createAvailability("unavailable", "Unavailable", "OpenAI API is not reachable from the current desktop runtime.");
  }

  if (!snapshot.configured) {
    return createAvailability("auth-required", "Auth required", "Add an API key to use OpenAI with direct API access.");
  }

  return createAvailability(
    "available",
    "Available",
    snapshot.apiKeyLast4 ? `Configured with API key ending in ${snapshot.apiKeyLast4}.` : "Configured for API key access.",
  );
}

export function mapOpenAiOAuthAvailability(options: {
  snapshot: Ima2SidecarSettingsSnapshot;
  isDesktop: boolean;
  status: "idle" | "loading" | "saving" | "error";
  error: string | null;
}) {
  const { snapshot, isDesktop, status, error } = options;

  if (!isDesktop) {
    return createAvailability("unavailable", "Unavailable", "Desktop app required for local OAuth proxy access.");
  }

  if (error || status === "error") {
    return createAvailability("unavailable", "Unavailable", error ?? "OAuth bridge settings failed to load.");
  }

  if (snapshot.oauthStatus === "auth_required" || snapshot.codexAuthStatus === "unauthed" || snapshot.codexAuthStatus === "missing") {
    return createAvailability("auth-required", "Login needed", "Log in with ChatGPT to enable OAuth generation.");
  }

  if (!snapshot.available || snapshot.oauthStatus === "offline") {
    return createAvailability("auth-required", "Starting", "Aref will start the local OAuth bridge automatically.");
  }

  if (snapshot.oauthStatus === "starting") {
    return createAvailability("auth-required", "Starting", "Aref is starting the local OAuth bridge.");
  }

  if (snapshot.oauthStatus === "ready") {
    return createAvailability("available", "Ready", "ChatGPT OAuth is ready.");
  }

  return createAvailability("unavailable", "Unavailable", "OAuth status could not be determined.");
}

export function mapMockProviderAvailability(enabled: boolean) {
  return enabled
    ? createAvailability("available", "Available", "Mock provider is enabled for development and testing.")
    : createAvailability("disabled", "Disabled", "Enable Developer Mode and show Mock Provider to use local mock generation.");
}

export function isProviderAvailabilitySelectable(descriptor: ProviderAvailabilityDescriptor) {
  return descriptor.state === "available" || descriptor.state === "auth-required";
}

export function isProviderAvailabilityAvailable(descriptor: ProviderAvailabilityDescriptor) {
  return descriptor.state === "available";
}

export function resolveOpenAiConcreteProvider(authMethod: ProviderAuthMethod) {
  return authMethod === "oauth" ? "ima2-sidecar" : "openai";
}

export function getResolvedOpenAiAuthMethod(
  desiredMethod: ProviderAuthMethod,
  availabilityByMethod: Record<ProviderAuthMethod, ProviderAvailabilityDescriptor>,
  loadingByMethod?: Partial<Record<ProviderAuthMethod, boolean>>,
) {
  if (loadingByMethod?.[desiredMethod]) {
    return desiredMethod;
  }

  if (isProviderAvailabilityAvailable(availabilityByMethod[desiredMethod])) {
    return desiredMethod;
  }

  if (desiredMethod === "oauth" && availabilityByMethod.oauth.state === "auth-required") {
    return desiredMethod;
  }

  const orderedMethods = orderProviderAuthMethods(Object.keys(availabilityByMethod) as ProviderAuthMethod[]);
  return (
    orderedMethods.find(
      (method) =>
        method !== desiredMethod
        && !loadingByMethod?.[method]
        && isProviderAvailabilityAvailable(availabilityByMethod[method]),
    )
    ?? desiredMethod
  );
}
