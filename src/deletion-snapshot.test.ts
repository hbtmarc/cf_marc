import { describe, expect, it } from "vitest";
import {
  createDeletionSnapshot,
  DELETION_SNAPSHOT_VERSION,
  parseDeletionSnapshot,
  resolveSnapshotAppData,
} from "./deletion-snapshot";
import { createFinanceEnvelope } from "./cloud-envelope";
import { emptyAppData } from "./storage";

describe("deletion snapshot", () => {
  it("creates and parses a valid snapshot", () => {
    const data = emptyAppData();
    data.selectedCompetenceMonth = "2026-07";
    const envelope = createFinanceEnvelope(data, "writer-1", 2);
    const snapshot = createDeletionSnapshot(data, envelope, "installation-1", 1_700_000_000_000);
    const parsed = parseDeletionSnapshot(snapshot);

    expect(parsed?.schemaVersion).toBe(DELETION_SNAPSHOT_VERSION);
    expect(parsed?.createdBy).toBe("installation-1");
    expect(parsed?.envelope?.revision).toBe(2);
    expect(parsed?.localData.selectedCompetenceMonth).toBe("2026-07");
  });

  it("prefers envelope data when resolving restore payload", () => {
    const local = emptyAppData();
    local.selectedCompetenceMonth = "2026-06";
    const remote = emptyAppData();
    remote.selectedCompetenceMonth = "2026-07";
    const snapshot = createDeletionSnapshot(local, createFinanceEnvelope(remote, "w", 1), "installation-1");

    expect(resolveSnapshotAppData(snapshot).selectedCompetenceMonth).toBe("2026-07");
  });

  it("rejects invalid snapshots", () => {
    expect(parseDeletionSnapshot(null)).toBeNull();
    expect(parseDeletionSnapshot({ schemaVersion: "x" })).toBeNull();
  });
});
