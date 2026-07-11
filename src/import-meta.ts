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

export function hasFingerprint(
  data: { importMeta?: { fingerprints: string[] } },
  fingerprint: string,
): boolean {
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
