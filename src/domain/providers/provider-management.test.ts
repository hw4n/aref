import { describe, expect, it } from "vitest";

import {
  getResolvedOpenAiAuthMethod,
  mapMockProviderAvailability,
  mapOpenAiApiKeyAvailability,
  mapOpenAiOAuthAvailability,
  orderProviderAuthMethods,
} from "./provider-management";

describe("provider management", () => {
  it("orders auth methods with OAuth before API key", () => {
    expect(orderProviderAuthMethods(["api-key", "oauth"])).toEqual(["oauth", "api-key"]);
  });

  it("maps OpenAI API key availability correctly", () => {
    expect(
      mapOpenAiApiKeyAvailability({
        snapshot: {
          configured: false,
          available: true,
          source: "none",
          apiKeyLast4: null,
          organizationId: null,
          projectId: null,
          baseUrl: "https://api.openai.com/v1",
        },
        isDesktop: true,
        status: "idle",
        error: null,
      }).state,
    ).toBe("auth-required");

    expect(
      mapOpenAiApiKeyAvailability({
        snapshot: {
          configured: true,
          available: true,
          source: "stored",
          apiKeyLast4: "1234",
          organizationId: null,
          projectId: null,
          baseUrl: "https://api.openai.com/v1",
        },
        isDesktop: true,
        status: "idle",
        error: null,
      }).state,
    ).toBe("available");
  });

  it("maps OAuth availability correctly", () => {
    expect(
      mapOpenAiOAuthAvailability({
        snapshot: {
          configured: true,
          available: true,
          source: "stored",
          baseUrl: "http://127.0.0.1:10531",
          oauthStatus: "auth_required",
          codexAuthStatus: "unauthed",
          proxyManaged: true,
        },
        isDesktop: true,
        status: "idle",
        error: null,
      }).state,
    ).toBe("auth-required");

    expect(
      mapOpenAiOAuthAvailability({
        snapshot: {
          configured: true,
          available: false,
          source: "stored",
          baseUrl: "http://127.0.0.1:10531",
          oauthStatus: "offline",
          codexAuthStatus: "authed",
          proxyManaged: true,
        },
        isDesktop: true,
        status: "idle",
        error: null,
      }).state,
    ).toBe("auth-required");
  });

  it("maps mock provider gating to disabled or available", () => {
    expect(mapMockProviderAvailability(false).state).toBe("disabled");
    expect(mapMockProviderAvailability(true).state).toBe("available");
  });

  it("keeps OAuth selected while the local OAuth bridge is being prepared", () => {
    const resolvedMethod = getResolvedOpenAiAuthMethod("oauth", {
      oauth: mapOpenAiOAuthAvailability({
        snapshot: {
          configured: true,
          available: false,
          source: "stored",
          baseUrl: "http://127.0.0.1:10531",
          oauthStatus: "offline",
          codexAuthStatus: "authed",
          proxyManaged: true,
        },
        isDesktop: true,
        status: "idle",
        error: null,
      }),
      "api-key": mapOpenAiApiKeyAvailability({
        snapshot: {
          configured: false,
          available: true,
          source: "none",
          apiKeyLast4: null,
          organizationId: null,
          projectId: null,
          baseUrl: "https://api.openai.com/v1",
        },
        isDesktop: true,
        status: "idle",
        error: null,
      }),
    });

    expect(resolvedMethod).toBe("oauth");
  });

  it("keeps API key selected while the user is configuring credentials", () => {
    const resolvedMethod = getResolvedOpenAiAuthMethod("api-key", {
      oauth: mapOpenAiOAuthAvailability({
        snapshot: {
          configured: true,
          available: true,
          source: "stored",
          baseUrl: "http://127.0.0.1:10531",
          oauthStatus: "ready",
          codexAuthStatus: "authed",
          proxyManaged: true,
        },
        isDesktop: true,
        status: "idle",
        error: null,
      }),
      "api-key": mapOpenAiApiKeyAvailability({
        snapshot: {
          configured: false,
          available: true,
          source: "none",
          apiKeyLast4: null,
          organizationId: null,
          projectId: null,
          baseUrl: "https://api.openai.com/v1",
        },
        isDesktop: true,
        status: "idle",
        error: null,
      }),
    });

    expect(resolvedMethod).toBe("api-key");
  });

  it("does not override while the selected auth method is still loading", () => {
    const resolvedMethod = getResolvedOpenAiAuthMethod(
      "oauth",
      {
        oauth: mapOpenAiOAuthAvailability({
          snapshot: {
            configured: false,
            available: false,
            source: "default",
            baseUrl: "http://127.0.0.1:10531",
            oauthStatus: "offline",
            codexAuthStatus: "unknown",
            proxyManaged: false,
          },
          isDesktop: true,
          status: "loading",
          error: null,
        }),
        "api-key": mapOpenAiApiKeyAvailability({
          snapshot: {
            configured: true,
            available: true,
            source: "stored",
            apiKeyLast4: "1234",
            organizationId: null,
            projectId: null,
            baseUrl: "https://api.openai.com/v1",
          },
          isDesktop: true,
          status: "idle",
          error: null,
        }),
      },
      {
        oauth: true,
        "api-key": false,
      },
    );

    expect(resolvedMethod).toBe("oauth");
  });
});
