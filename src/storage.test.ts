import { describe, expect, it } from "vitest";
import {
  emptyAppData,
  parseAppDataJson,
  serializeAppData,
  validateAppData,
} from "./storage";
import type { AppData } from "./types";

describe("storage", () => {
  it("serializes and reads valid app data", () => {
    const data = emptyAppData();
    data.transactions.push({
      id: "tx-1",
      kind: "income",
      description: "Teste",
      amountCents: 1000,
      date: "2026-07-01",
      competenceMonth: "2026-07",
      category: "Outros",
      status: "pending",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });

    const raw = serializeAppData(data);
    const loaded = parseAppDataJson(raw);

    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.data.schemaVersion).toBe("cfm.local.v2");
      expect(loaded.data.transactions).toHaveLength(1);
    }
  });

  it("rejects invalid JSON without mutating raw payload", () => {
    const loaded = parseAppDataJson("{ invalid");
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.raw).toBe("{ invalid");
      expect(loaded.message).toContain("JSON inválido");
    }
  });

  it("rejects invalid structure", () => {
    const loaded = parseAppDataJson(
      JSON.stringify({ schemaVersion: "cfm.local.v1" }),
    );
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.message).toContain("Estrutura inválida");
    }
  });

  it("validates app data schema", () => {
    const valid = emptyAppData();
    expect(validateAppData(valid)).toBe(true);
    expect(validateAppData({} as AppData)).toBe(false);
  });
});
