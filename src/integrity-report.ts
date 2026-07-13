import { createHash } from "node:crypto";
import { normalizeAppData, serializeAppData } from "./storage";
import type { AppData } from "./types";

const COLLECTION_FIELDS = [
  "transactions",
  "cards",
  "invoices",
  "recurringRules",
  "recurringMatches",
  "ignoredRecurringSuggestions",
  "transactionDescriptionAliases",
  "monthlyBalances",
] as const;

export function canonicalAppDataJson(data: AppData): string {
  return serializeAppData(normalizeAppData(structuredClone(data)));
}

export function sha256AppData(data: AppData): string {
  return createHash("sha256").update(canonicalAppDataJson(data)).digest("hex");
}

function countCollection(data: AppData, field: (typeof COLLECTION_FIELDS)[number]): number {
  const value = data[field];
  return Array.isArray(value) ? value.length : 0;
}

export interface IntegrityReport {
  localHash: string;
  remoteHash: string | null;
  hashesMatch: boolean;
  revision: number | null;
  selectedCompetenceMonth: string;
  topLevelFields: string[];
  collectionCounts: Record<string, number>;
  remoteCollectionCounts: Record<string, number> | null;
}

export function buildIntegrityReport(
  local: AppData,
  remote: AppData | null,
  revision: number | null,
): IntegrityReport {
  const normalizedLocal = normalizeAppData(structuredClone(local));
  const normalizedRemote = remote ? normalizeAppData(structuredClone(remote)) : null;

  const collectionCounts = Object.fromEntries(
    COLLECTION_FIELDS.map((field) => [field, countCollection(normalizedLocal, field)]),
  );

  const remoteCollectionCounts = normalizedRemote
    ? Object.fromEntries(
        COLLECTION_FIELDS.map((field) => [field, countCollection(normalizedRemote, field)]),
      )
    : null;

  const localHash = sha256AppData(normalizedLocal);
  const remoteHash = normalizedRemote ? sha256AppData(normalizedRemote) : null;

  return {
    localHash,
    remoteHash,
    hashesMatch: remoteHash !== null && localHash === remoteHash,
    revision,
    selectedCompetenceMonth: normalizedLocal.selectedCompetenceMonth,
    topLevelFields: Object.keys(normalizedLocal).sort(),
    collectionCounts,
    remoteCollectionCounts,
  };
}

export function formatIntegrityReport(report: IntegrityReport): string {
  const lines = [
    `revision: ${report.revision ?? "null"}`,
    `selectedCompetenceMonth: ${report.selectedCompetenceMonth}`,
    `localHash: ${report.localHash}`,
    `remoteHash: ${report.remoteHash ?? "null"}`,
    `hashesMatch: ${report.hashesMatch}`,
    `topLevelFields: ${report.topLevelFields.join(", ")}`,
    "collectionCounts:",
    ...Object.entries(report.collectionCounts).map(([k, v]) => `  ${k}: ${v}`),
  ];

  if (report.remoteCollectionCounts) {
    lines.push("remoteCollectionCounts:");
    for (const [k, v] of Object.entries(report.remoteCollectionCounts)) {
      lines.push(`  ${k}: ${v}`);
    }
  }

  return lines.join("\n");
}
