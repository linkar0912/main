type UnknownRecord = Record<string, unknown>;

export type SafeDiagnostics = {
  version: 1;
  generatedAt: string;
  instagram: Array<{
    id: string;
    status: string;
    subscribedFields: string[];
    missingFields: string[];
    check: "ok" | "failed";
  }>;
  facebook: Array<{
    id: string;
    status: string;
    subscribedFields: string[];
    missingFields: string[];
    check: "ok" | "failed";
  }>;
  recentFailures: Array<{
    id: string;
    kind: string;
    resultCode?: string;
    attemptCount: number;
    updatedAt: string;
  }>;
};

function stringValue(value: unknown, fallback = "unknown"): string {
  return typeof value === "string" && value ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function projectHealth(record: UnknownRecord) {
  return {
    id: stringValue(record.id),
    status: stringValue(record.status),
    subscribedFields: stringArray(record.subscribedFields),
    missingFields: stringArray(record.missingFields),
    check: typeof record.checkError === "string" && record.checkError ? "failed" as const : "ok" as const,
  };
}

export function buildSafeDiagnostics(input: {
  generatedAt: string;
  instagramHealth: UnknownRecord[];
  facebookHealth: UnknownRecord[];
  failures: UnknownRecord[];
}): SafeDiagnostics {
  return {
    version: 1,
    generatedAt: input.generatedAt,
    instagram: input.instagramHealth.map(projectHealth),
    facebook: input.facebookHealth.map(projectHealth),
    recentFailures: input.failures.slice(0, 20).map((record) => ({
      id: stringValue(record.id),
      kind: stringValue(record.kind),
      ...(typeof record.resultCode === "string" && record.resultCode ? { resultCode: record.resultCode } : {}),
      attemptCount: typeof record.attemptCount === "number" ? Math.max(0, Math.trunc(record.attemptCount)) : 0,
      updatedAt: stringValue(record.updatedAt),
    })),
  };
}
