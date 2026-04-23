import type {
  GenerationProviderInvocation,
  GenerationProviderResult,
  OneShotGenerationProviderAdapter,
} from "@/domain/providers/types";

const MOCK_QUEUED_DELAY_MS = 280;
const MOCK_RUNNING_DELAY_MS = 920;

function createAbortError() {
  const error = new Error("Generation cancelled.");
  error.name = "AbortError";
  return error;
}

function waitWithAbort(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }

    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError());
    };

    signal.addEventListener("abort", onAbort);
  });
}

function hashString(value: string) {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapText(text: string, maxCharacters: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length <= maxCharacters) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, 4);
}

function getImageDimensions(aspectRatio: GenerationProviderInvocation["request"]["settings"]["aspectRatio"]) {
  if (aspectRatio === "4:3") {
    return { width: 1200, height: 900 };
  }

  if (aspectRatio === "3:4") {
    return { width: 900, height: 1200 };
  }

  if (aspectRatio === "16:9") {
    return { width: 1600, height: 900 };
  }

  if (aspectRatio === "9:16") {
    return { width: 900, height: 1600 };
  }

  return { width: 1024, height: 1024 };
}

function createMockImageDataUrl(invocation: GenerationProviderInvocation, index: number) {
  const { width, height } = getImageDimensions(invocation.request.settings.aspectRatio);
  const promptHash = hashString(`${invocation.request.prompt}-${index}-${invocation.jobId}`);
  const hue = promptHash % 360;
  const secondaryHue = (hue + 38) % 360;
  const accentHue = (hue + 210) % 360;
  const promptLines = wrapText(invocation.request.prompt, 28);
  const negativePrompt = invocation.request.negativePrompt?.trim();
  const refsLabel = `${invocation.referenceAssets.length} refs`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${hue} 68% 58%)" />
          <stop offset="100%" stop-color="hsl(${secondaryHue} 54% 20%)" />
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="38%" r="60%">
          <stop offset="0%" stop-color="hsla(${accentHue} 90% 78% / 0.36)" />
          <stop offset="100%" stop-color="transparent" />
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)" />
      <rect x="40" y="40" width="${width - 80}" height="${height - 80}" fill="rgba(8, 12, 18, 0.28)" stroke="rgba(255,255,255,0.16)" />
      <rect x="72" y="72" width="${width - 144}" height="${height - 144}" fill="url(#glow)" />
      <text x="84" y="120" font-family="Ubuntu, Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="40" fill="rgba(255,255,255,0.9)">Mock Provider</text>
      <text x="84" y="168" font-family="Ubuntu, Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="24" fill="rgba(255,255,255,0.72)">${escapeXml(invocation.request.model)} • ${refsLabel} • ${index + 1}/${invocation.request.settings.imageCount}</text>
      ${promptLines
        .map(
          (line, lineIndex) =>
            `<text x="84" y="${260 + lineIndex * 58}" font-family="Ubuntu, Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="46" fill="#ffffff">${escapeXml(line)}</text>`,
        )
        .join("")}
      ${
        negativePrompt
          ? `<text x="84" y="${height - 114}" font-family="Ubuntu, Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="22" fill="rgba(255,255,255,0.68)">Avoid: ${escapeXml(negativePrompt.slice(0, 76))}</text>`
          : ""
      }
      <text x="84" y="${height - 72}" font-family="Ubuntu, Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="22" fill="rgba(255,255,255,0.56)">Generated locally for harness testing</text>
    </svg>
  `;

  return {
    imagePath: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width,
    height,
    sourceName: `mock-${invocation.request.model}-${index + 1}.svg`,
    thumbnailPath: null,
  };
}

export const mockGenerationProvider: OneShotGenerationProviderAdapter = {
  id: "mock",
  label: "Mock / Dev",
  defaultModel: "mock-canvas-v1",
  flowKind: "one-shot",
  models: [
    { id: "mock-canvas-v1", label: "Mock Canvas v1" },
    { id: "mock-canvas-v2", label: "Mock Canvas v2" },
  ],
  async generateImages(invocation, options): Promise<GenerationProviderResult> {
    await waitWithAbort(MOCK_QUEUED_DELAY_MS, options.signal);
    options.onStatusChange?.("running");
    await waitWithAbort(MOCK_RUNNING_DELAY_MS, options.signal);

    if (/\bfail\b|\berror\b/i.test(invocation.request.prompt)) {
      throw new Error("Mock provider forced a failure because the prompt requested one.");
    }

    return {
      provider: this.id,
      model: invocation.request.model,
      completedAt: new Date().toISOString(),
      requestId: `mock-${invocation.jobId}`,
      mode: invocation.referenceAssets.length > 0 ? "edit" : "generate",
      images: Array.from({ length: invocation.request.settings.imageCount }, (_unused, index) =>
        createMockImageDataUrl(invocation, index),
      ),
    };
  },
};
