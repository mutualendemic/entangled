const REALTIME_DEBUG_STORAGE_KEY = "entanglement.realtime.debug";
const CLIENT_DEBUG_STORAGE_KEY = "entanglement.client.debug";
const MAX_REALTIME_ENTRIES = 20;
const MAX_CLIENT_ENTRIES = 120;

type DiagnosticEntry = Record<string, unknown>;

function readEntries(key: string): DiagnosticEntry[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is DiagnosticEntry => Boolean(entry) && typeof entry === "object")
      : [];
  } catch {
    return [];
  }
}

function appendEntry(key: string, context: DiagnosticEntry, maxEntries: number): void {
  try {
    const entries = readEntries(key);
    entries.push({ ...context, ts: new Date().toISOString() });
    sessionStorage.setItem(key, JSON.stringify(entries.slice(-maxEntries)));
  } catch {
    // Diagnostics are optional; storage failures must not affect gameplay.
  }
}

export function recordRealtimeDiagnostic(context: DiagnosticEntry): void {
  appendEntry(REALTIME_DEBUG_STORAGE_KEY, context, MAX_REALTIME_ENTRIES);
}

export function recordClientDiagnostic(context: DiagnosticEntry): void {
  appendEntry(CLIENT_DEBUG_STORAGE_KEY, context, MAX_CLIENT_ENTRIES);
}

export function downloadClientDiagnostics(): boolean {
  const realtime = readEntries(REALTIME_DEBUG_STORAGE_KEY);
  const client = readEntries(CLIENT_DEBUG_STORAGE_KEY);
  if (realtime.length === 0 && client.length === 0) return false;

  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; rtt?: number; downlink?: number };
  }).connection;
  const diagnostics = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    environment: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      deviceMemoryGiB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
      network: connection ? {
        effectiveType: connection.effectiveType ?? null,
        rttMs: connection.rtt ?? null,
        downlinkMbps: connection.downlink ?? null,
      } : null,
      visibilityState: document.visibilityState,
    },
    realtime,
    client,
  };

  try {
    const download = new Blob([JSON.stringify(diagnostics, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(download);
    const link = document.createElement("a");
    link.href = url;
    link.download = "entanglement-client-diagnostics.json";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}
