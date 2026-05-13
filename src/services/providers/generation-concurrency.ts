import type { GenerationProviderInvocation } from "@/domain/providers/types";

type ReleasePermit = () => void;

const IMA2_SIDECAR_CONCURRENCY = 2;
const OPENAI_CONCURRENCY = 3;
const MOCK_CONCURRENCY = 4;
const REFERENCE_HEAVY_COUNT = 3;

function createAbortError() {
  const error = new Error("Generation cancelled.");
  error.name = "AbortError";
  return error;
}

function normalizePermitCount(value: number, capacity: number) {
  return Math.min(capacity, Math.max(1, Math.ceil(value)));
}

export class WeightedSemaphore {
  private available: number;
  private readonly queue: Array<{
    weight: number;
    resolve: (release: ReleasePermit) => void;
    reject: (error: Error) => void;
    signal: AbortSignal;
    abortHandler: () => void;
  }> = [];

  constructor(private readonly capacity: number) {
    this.available = capacity;
  }

  acquire(weight: number, signal: AbortSignal): Promise<ReleasePermit> {
    const normalizedWeight = normalizePermitCount(weight, this.capacity);

    if (signal.aborted) {
      return Promise.reject(createAbortError());
    }

    if (this.queue.length === 0 && this.available >= normalizedWeight) {
      this.available -= normalizedWeight;
      return Promise.resolve(() => this.release(normalizedWeight));
    }

    return new Promise((resolve, reject) => {
      const entry = {
        weight: normalizedWeight,
        resolve,
        reject,
        signal,
        abortHandler: () => {
          const index = this.queue.indexOf(entry);
          if (index >= 0) {
            this.queue.splice(index, 1);
          }
          reject(createAbortError());
          this.drain();
        },
      };

      signal.addEventListener("abort", entry.abortHandler, { once: true });
      this.queue.push(entry);
      this.drain();
    });
  }

  private release(weight: number) {
    this.available = Math.min(this.capacity, this.available + weight);
    this.drain();
  }

  private drain() {
    while (this.queue.length > 0) {
      const entry = this.queue[0]!;

      if (entry.signal.aborted) {
        this.queue.shift();
        entry.signal.removeEventListener("abort", entry.abortHandler);
        entry.reject(createAbortError());
        continue;
      }

      if (entry.weight > this.available) {
        return;
      }

      this.queue.shift();
      this.available -= entry.weight;
      entry.signal.removeEventListener("abort", entry.abortHandler);
      entry.resolve(() => this.release(entry.weight));
    }
  }
}

export interface GenerationConcurrencyPlan {
  providerId: string;
  capacity: number;
  permits: number;
  isHeavy: boolean;
}

const providerQueues = new Map<string, WeightedSemaphore>();

function providerCapacity(providerId: string) {
  if (providerId === "ima2-sidecar") {
    return IMA2_SIDECAR_CONCURRENCY;
  }

  if (providerId === "openai") {
    return OPENAI_CONCURRENCY;
  }

  return MOCK_CONCURRENCY;
}

function isHeavyGeneration(invocation: GenerationProviderInvocation) {
  return invocation.request.settings.size === "3840x2160"
    || invocation.request.settings.size === "2160x3840"
    || invocation.referenceAssets.length >= REFERENCE_HEAVY_COUNT;
}

export function getGenerationConcurrencyPlan(invocation: GenerationProviderInvocation): GenerationConcurrencyPlan {
  const capacity = providerCapacity(invocation.request.provider);
  const isHeavy = isHeavyGeneration(invocation);
  const permits = normalizePermitCount(isHeavy && invocation.request.provider !== "mock" ? 2 : 1, capacity);

  return {
    providerId: invocation.request.provider,
    capacity,
    permits,
    isHeavy,
  };
}

function providerQueue(providerId: string, capacity: number) {
  const existing = providerQueues.get(providerId);

  if (existing) {
    return existing;
  }

  const next = new WeightedSemaphore(capacity);
  providerQueues.set(providerId, next);
  return next;
}

export async function runGenerationWithConcurrency<T>(
  invocation: GenerationProviderInvocation,
  signal: AbortSignal,
  task: () => Promise<T>,
): Promise<T> {
  const plan = getGenerationConcurrencyPlan(invocation);
  const release = await providerQueue(plan.providerId, plan.capacity).acquire(plan.permits, signal);

  try {
    return await task();
  } finally {
    release();
  }
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  signal: AbortSignal,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const concurrency = Math.max(1, Math.floor(limit));

  if (items.length === 0) {
    return [];
  }

  if (signal.aborted) {
    throw createAbortError();
  }

  return new Promise((resolve, reject) => {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    let activeCount = 0;
    let settled = false;

    const settleRejected = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      signal.removeEventListener("abort", onAbort);
      reject(error);
    };

    const onAbort = () => {
      settleRejected(createAbortError());
    };

    const launch = () => {
      if (settled) {
        return;
      }

      if (signal.aborted) {
        onAbort();
        return;
      }

      if (nextIndex >= items.length && activeCount === 0) {
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve(results);
        return;
      }

      while (activeCount < concurrency && nextIndex < items.length) {
        const index = nextIndex;
        const item = items[index]!;
        nextIndex += 1;
        activeCount += 1;

        worker(item, index)
          .then((result) => {
            results[index] = result;
            activeCount -= 1;
            launch();
          })
          .catch(settleRejected);
      }
    };

    signal.addEventListener("abort", onAbort, { once: true });
    launch();
  });
}
