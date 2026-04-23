import type { OneShotGenerationProviderAdapter } from "@/domain/providers/types";

import { ima2SidecarGenerationProvider } from "./ima2-sidecar-provider";
import { mockGenerationProvider } from "./mock-provider";
import { openAiGenerationProvider } from "./openai-provider";

const providers: OneShotGenerationProviderAdapter[] = [
  mockGenerationProvider,
  openAiGenerationProvider,
  ima2SidecarGenerationProvider,
];

export function listGenerationProviders() {
  return providers;
}

export function getGenerationProvider(providerId: string) {
  return providers.find((provider) => provider.id === providerId) ?? null;
}
