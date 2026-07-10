import type { ImportPayload, ImportTransaction } from "./import-types";

const SHA256_REGEX = /^sha256:[a-f0-9]{64}$/i;

export function normalizeDescription(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isValidSha256Hash(value: string): boolean {
  return SHA256_REGEX.test(value.trim());
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function relocateReadableHash(host: Record<string, unknown>): void {
  const raw = host.rawHash;
  if (raw === undefined) {
    return;
  }
  if (typeof raw === "string" && isValidSha256Hash(raw)) {
    return;
  }
  if (!isNonEmptyString(raw)) {
    delete host.rawHash;
    return;
  }
  const source =
    host.source && typeof host.source === "object" && host.source !== null
      ? (host.source as Record<string, unknown>)
      : {};
  host.source = source;
  const fp = String(raw).trim();
  if (!source.canonicalFingerprint) {
    source.canonicalFingerprint = fp;
  } else if (!source.rawFingerprint) {
    source.rawFingerprint = fp;
  }
  delete host.rawHash;
}

function normalizeTransactionHashes(tx: ImportTransaction): ImportTransaction {
  if (!tx.source) {
    return { ...tx };
  }
  const source = { ...tx.source };
  if (source.rawHash !== undefined) {
    const srcHash = source.rawHash;
    if (typeof srcHash === "string" && isValidSha256Hash(srcHash)) {
      // keep valid sha256 in source
    } else if (isNonEmptyString(srcHash)) {
      if (!source.canonicalFingerprint) {
        source.canonicalFingerprint = srcHash.trim();
      } else if (!source.rawFingerprint) {
        source.rawFingerprint = srcHash.trim();
      }
      delete source.rawHash;
    } else {
      delete source.rawHash;
    }
  }
  return { ...tx, source };
}

export function normalizeImportPayload(payload: ImportPayload): ImportPayload {
  const source = { ...payload.source };
  relocateReadableHash(source as unknown as Record<string, unknown>);

  const transactions = (payload.transactions ?? []).map((tx) =>
    normalizeTransactionHashes(tx),
  );

  return {
    ...payload,
    source,
    accounts: payload.accounts ?? [],
    cards: payload.cards ?? [],
    cardSnapshots: payload.cardSnapshots ?? [],
    invoices: payload.invoices ?? [],
    transactions,
    installmentPlans: payload.installmentPlans ?? [],
    recurringRules: payload.recurringRules ?? [],
  };
}

function getTxRawHash(tx: ImportTransaction): string {
  const sourceHash = tx.source?.rawHash;
  if (typeof sourceHash === "string" && isValidSha256Hash(sourceHash)) {
    return sourceHash;
  }
  return "";
}

function getTxTraceFingerprint(tx: ImportTransaction): string {
  return (
    tx.source?.canonicalFingerprint?.trim() ||
    tx.source?.rawFingerprint?.trim() ||
    ""
  );
}

export function buildCanonicalFingerprint(
  tx: ImportTransaction,
  context: { institution?: string; documentType?: string },
): string {
  const invRef = tx.invoiceId || "";
  const instCur = tx.installment?.current ?? "";
  const instTot = tx.installment?.total ?? "";
  const hash = getTxRawHash(tx) || getTxTraceFingerprint(tx);
  return [
    String(context.institution ?? ""),
    String(context.documentType ?? ""),
    String(tx.accountId || tx.cardId || ""),
    tx.date || "",
    String(tx.amountCents || 0),
    String(tx.flow || ""),
    String(tx.type || ""),
    normalizeDescription(tx.description),
    String(invRef),
    instCur !== "" ? String(instCur) : "",
    instTot !== "" ? String(instTot) : "",
    hash,
  ].join("|");
}

export function ensureImportMeta(data: {
  importMeta?: { fingerprints: string[] };
}): { fingerprints: string[] } {
  if (!data.importMeta) {
    data.importMeta = { fingerprints: [] };
  }
  if (!Array.isArray(data.importMeta.fingerprints)) {
    data.importMeta.fingerprints = [];
  }
  return data.importMeta;
}

export function hasFingerprint(data: { importMeta?: { fingerprints: string[] } }, fingerprint: string): boolean {
  if (!fingerprint) {
    return false;
  }
  return ensureImportMeta(data).fingerprints.includes(fingerprint);
}

export function rememberFingerprint(
  data: { importMeta?: { fingerprints: string[] } },
  fingerprint: string,
): void {
  if (!fingerprint) {
    return;
  }
  const meta = ensureImportMeta(data);
  if (!meta.fingerprints.includes(fingerprint)) {
    meta.fingerprints.push(fingerprint);
  }
}
