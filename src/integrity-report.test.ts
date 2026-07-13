import { describe, expect, it } from "vitest";
import { buildIntegrityReport, sha256AppData } from "./integrity-report";
import { emptyAppData } from "./storage";

describe("integrity report", () => {
  it("produces matching hashes for equivalent AppData", () => {
    const local = emptyAppData();
    local.selectedCompetenceMonth = "2026-07";
    const remote = structuredClone(local);
    const report = buildIntegrityReport(local, remote, 1);
    expect(report.hashesMatch).toBe(true);
    expect(report.localHash).toBe(sha256AppData(remote));
    expect(report.collectionCounts.transactions).toBe(0);
  });

  it("detects hash mismatch", () => {
    const local = emptyAppData();
    const remote = emptyAppData();
    remote.selectedCompetenceMonth = "2026-08";
    const report = buildIntegrityReport(local, remote, 2);
    expect(report.hashesMatch).toBe(false);
  });
});
