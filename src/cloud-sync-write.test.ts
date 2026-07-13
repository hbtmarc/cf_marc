import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFinanceEnvelope } from "./cloud-envelope";
import { emptyAppData } from "./storage";

const mocks = vi.hoisted(() => ({
  runTransaction: vi.fn(),
}));

vi.mock("firebase/database", () => ({
  get: vi.fn(),
  onValue: vi.fn(),
  ref: vi.fn(() => ({ path: "personal/finance" })),
  runTransaction: mocks.runTransaction,
  set: vi.fn(),
}));

vi.mock("./firebase", () => ({
  getFirebaseDatabase: () => ({ name: "test-db" }),
}));

import {
  RemoteWriteConflictError,
  writeRemoteFinance,
} from "./cloud-sync";

function transactionResult(current: unknown) {
  mocks.runTransaction.mockImplementationOnce(
    async (_reference: unknown, updater: (value: unknown) => unknown) => {
      const next = updater(current);
      if (next === undefined) {
        return {
          committed: false,
          snapshot: { exists: () => false, val: () => null },
        };
      }
      return {
        committed: true,
        snapshot: { exists: () => true, val: () => next },
      };
    },
  );
}

describe("writeRemoteFinance", () => {
  beforeEach(() => {
    mocks.runTransaction.mockReset();
  });

  it("writes revision 1 when the remote node is empty", async () => {
    transactionResult(null);
    const envelope = await writeRemoteFinance(emptyAppData(), "writer", 0);
    expect(envelope.revision).toBe(1);
  });

  it("reads the raw current value and increments consecutive writes", async () => {
    const current = createFinanceEnvelope(emptyAppData(), "writer", 1);
    transactionResult(current);
    const data = emptyAppData();
    data.selectedCompetenceMonth = "2026-08";

    const envelope = await writeRemoteFinance(data, "writer", 1);

    expect(envelope.revision).toBe(2);
    expect(envelope.data.selectedCompetenceMonth).toBe("2026-08");
  });

  it("aborts when the remote revision is newer than the local base", async () => {
    transactionResult(createFinanceEnvelope(emptyAppData(), "other", 3));
    await expect(
      writeRemoteFinance(emptyAppData(), "writer", 2),
    ).rejects.toBeInstanceOf(RemoteWriteConflictError);
  });
});
