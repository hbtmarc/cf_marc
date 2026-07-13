import { describe, expect, it } from "vitest";
import { paymentItemDisplayStatus } from "./payment-item-status";
import type { PaymentChecklistItem } from "./payment-checklist";

function item(partial: Partial<PaymentChecklistItem>): PaymentChecklistItem {
  return {
    id: "item-1",
    kind: "invoice",
    title: "Teste",
    detail: "Detalhe",
    amountCents: 1000,
    dueDateIso: "2026-07-15",
    sourceState: "pending",
    sourceLabel: "Pendente",
    sourceChecked: false,
    manuallyChecked: false,
    checked: false,
    checkable: true,
    ...partial,
  };
}

describe("payment item display status", () => {
  it("returns PAGO when manually checked", () => {
    expect(paymentItemDisplayStatus(item({ manuallyChecked: true }), "2026-07-13").label).toBe(
      "PAGO",
    );
  });

  it("returns Vencida when due date passed", () => {
    expect(paymentItemDisplayStatus(item({ dueDateIso: "2026-07-10" }), "2026-07-13").label).toBe(
      "Vencida",
    );
  });

  it("returns A Vencer when due date is within the window", () => {
    expect(paymentItemDisplayStatus(item({ dueDateIso: "2026-07-15" }), "2026-07-13").label).toBe(
      "A Vencer",
    );
    expect(paymentItemDisplayStatus(item({ dueDateIso: "2026-07-13" }), "2026-07-13").label).toBe(
      "A Vencer",
    );
  });

  it("returns Em aberto when due date is far ahead", () => {
    expect(paymentItemDisplayStatus(item({ dueDateIso: "2026-07-25" }), "2026-07-13").label).toBe(
      "Em aberto",
    );
  });

  it("returns Em aberto without due date", () => {
    expect(paymentItemDisplayStatus(item({ dueDateIso: "" }), "2026-07-13").label).toBe("Em aberto");
  });
});
