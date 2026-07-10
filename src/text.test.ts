import { describe, expect, it } from "vitest";
import {
  formatInvoiceCount,
  formatItemCount,
  pluralize,
  sentenceCase,
} from "./text";

describe("text helpers", () => {
  it("pluralizes correctly", () => {
    expect(pluralize(0, "fatura", "faturas")).toBe("0 faturas");
    expect(pluralize(1, "fatura", "faturas")).toBe("1 fatura");
    expect(pluralize(2, "fatura", "faturas")).toBe("2 faturas");
    expect(formatItemCount(1)).toBe("1 item");
    expect(formatInvoiceCount(3)).toBe("3 faturas");
  });

  it("applies sentence case", () => {
    expect(sentenceCase("Julho de 2026")).toBe("julho de 2026");
  });
});
