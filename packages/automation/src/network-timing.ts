/** Reference latency (ms) for a "fast" connection — multiplier stays at 1. */
const BASE_LATENCY_MS = 150;
/** Upper bound on timeout scaling for very slow links. */
const MAX_MULTIPLIER = 6;

const PROBE_TARGETS = [
  "https://www.tiktok.com",
  "https://www.google.com/generate_204",
] as const;

export interface NetworkTimingProfile {
  /** Median round-trip latency in ms across probe requests. */
  latencyMs: number;
  /** Scale factor applied to automation timeouts (1 = fast, up to MAX_MULTIPLIER). */
  multiplier: number;
  scaledMs(baseMs: number): number;
}

/**
 * Probes network latency before browser automation starts so upload waits
 * can scale with the user's connection speed.
 */
export async function measureNetworkTiming(): Promise<NetworkTimingProfile> {
  const samples = await collectLatencySamples();
  const latencyMs = samples.length > 0 ? median(samples) : 400;
  const multiplier = Math.min(MAX_MULTIPLIER, Math.max(1, latencyMs / BASE_LATENCY_MS));

  return {
    latencyMs,
    multiplier,
    scaledMs(baseMs: number) {
      return Math.round(baseMs * multiplier);
    },
  };
}

async function collectLatencySamples(): Promise<number[]> {
  const samples: number[] = [];

  for (const url of PROBE_TARGETS) {
    for (let i = 0; i < 2; i++) {
      const sample = await probeLatency(url);
      if (sample !== null) {
        samples.push(sample);
      }
    }
  }

  return samples;
}

async function probeLatency(url: string): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const start = performance.now();
    await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    return performance.now() - start;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}
