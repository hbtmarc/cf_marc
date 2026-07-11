import { describe, expect, it } from "vitest";
import {
  applyCardCompletionsToPayload,
  buildCardCompletionFields,
  canConfirmImportWithCompletions,
  hasConfiguredClosingDay,
  mergeImportCardDays,
  renderCardCompletionSection,
  syncCardCompletionValidation,
  validateCardCompletionDrafts,
  validateCardDayInput,
} from "./import-card-review";
import { applyImportPlan, buildImportPlan, cloneAppData } from "./import";
import { validateImportDocument } from "./import-validate";
import fixtureDocument from "./fixtures/cfm-import-v1-valid.json";
import { emptyAppData } from "./storage";
import type { ImportPayload } from "./import-types";

const payload = fixtureDocument as ImportPayload;

describe("import card completion review", () => {
  it("lists only cards with missing cycle fields", () => {
    const fields = buildCardCompletionFields(payload, emptyAppData());
    expect(fields.map((item) => item.name)).toEqual([
      "Ourocard Platinum",
      "Porto Seguro Visa",
      "Mercado Pago",
    ]);
    expect(fields.find((item) => item.name === "Cartão Sintético")).toBeUndefined();
    expect(fields.find((item) => item.name === "Ourocard Platinum")).toMatchObject({
      needsClosingDay: true,
      needsDueDay: true,
    });
    expect(fields.find((item) => item.name === "Porto Seguro Visa")).toMatchObject({
      needsClosingDay: true,
      needsDueDay: false,
    });
    expect(fields.find((item) => item.name === "Mercado Pago")).toMatchObject({
      needsClosingDay: false,
      needsDueDay: true,
    });
  });

  it("renders completion section in Portuguese without technical field names", () => {
    const fields = buildCardCompletionFields(payload, emptyAppData());
    const html = renderCardCompletionSection(fields, {}, {});
    expect(html).toContain("Complete os dados dos cartões");
    expect(html).toContain("Dia de fechamento");
    expect(html).toContain("Dia de vencimento");
    expect(html).not.toContain("closingDay ausente");
    expect(html).not.toContain("dueDay ausente");
  });

  it("rejects values below 1, above 31 and decimals", () => {
    expect(validateCardDayInput("", true)).toContain("Informe um dia");
    expect(validateCardDayInput("0", true)).toContain("Informe um dia");
    expect(validateCardDayInput("32", true)).toContain("Informe um dia");
    expect(validateCardDayInput("10.5", true)).toContain("Informe um dia");
    expect(validateCardDayInput("15", true)).toBeNull();
  });

  it("blocks confirmation while required fields are missing or invalid", () => {
    const fields = buildCardCompletionFields(payload, emptyAppData());
    expect(canConfirmImportWithCompletions(fields, {})).toBe(false);
    expect(
      canConfirmImportWithCompletions(fields, {
        card_ourocard: { closingDay: "10", dueDay: "15" },
        card_porto: { closingDay: "abc", dueDay: "" },
        card_mercado_pago: { closingDay: "", dueDay: "12" },
      }),
    ).toBe(false);
    expect(
      canConfirmImportWithCompletions(fields, {
        card_ourocard: { closingDay: "10", dueDay: "15" },
        card_porto: { closingDay: "5", dueDay: "" },
        card_mercado_pago: { closingDay: "", dueDay: "12" },
      }),
    ).toBe(true);
  });

  it("persists filled values on card import", () => {
    const validated = validateImportDocument(payload, "fixture.json");
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }
    const fields = buildCardCompletionFields(validated.payload, emptyAppData());
    const drafts = {
      card_ourocard: { closingDay: "11", dueDay: "21" },
      card_porto: { closingDay: "8", dueDay: "" },
      card_mercado_pago: { closingDay: "", dueDay: "9" },
    };
    const completedPayload = applyCardCompletionsToPayload(
      validated.payload,
      fields,
      drafts,
    );
    const data = emptyAppData();
    applyImportPlan(
      data,
      buildImportPlan(data, completedPayload, { ...validated.summary, fileName: "fixture.json" }),
    );
    const ourocard = data.cards.find((item) => item.sourceImportId === "card_ourocard");
    const porto = data.cards.find((item) => item.sourceImportId === "card_porto");
    const mercado = data.cards.find((item) => item.sourceImportId === "card_mercado_pago");
    expect(ourocard?.closingDay).toBe(11);
    expect(ourocard?.dueDay).toBe(21);
    expect(porto?.closingDay).toBe(8);
    expect(mercado?.dueDay).toBe(9);
  });

  it("preserves locally configured days on reimport when JSON omits them", () => {
    const validated = validateImportDocument(payload, "fixture.json");
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }
    const firstImport = cloneAppData(emptyAppData());
    const fields = buildCardCompletionFields(validated.payload, firstImport);
    const completedPayload = applyCardCompletionsToPayload(validated.payload, fields, {
      card_ourocard: { closingDay: "11", dueDay: "21" },
      card_porto: { closingDay: "8", dueDay: "" },
      card_mercado_pago: { closingDay: "", dueDay: "9" },
    });
    applyImportPlan(
      firstImport,
      buildImportPlan(firstImport, completedPayload, {
        ...validated.summary,
        fileName: "fixture.json",
      }),
    );

    const reimportFields = buildCardCompletionFields(validated.payload, firstImport);
    expect(reimportFields).toHaveLength(0);
    applyImportPlan(
      firstImport,
      buildImportPlan(firstImport, validated.payload, {
        ...validated.summary,
        fileName: "fixture.json",
      }),
    );
    const ourocard = firstImport.cards.find((item) => item.sourceImportId === "card_ourocard");
    expect(ourocard?.closingDay).toBe(11);
    expect(ourocard?.dueDay).toBe(21);
  });

  it("does not erase local days when JSON lacks cycle fields", () => {
    const localCard = {
      id: "local-1",
      name: "Ourocard Platinum",
      closingDay: 11,
      dueDay: 21,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      sourceImportId: "card_ourocard",
    };
    expect(
      mergeImportCardDays({ id: "card_ourocard", name: "Ourocard Platinum" }, localCard),
    ).toEqual({ closingDay: 11, dueDay: 21 });
    expect(hasConfiguredClosingDay({ id: "card_ourocard", name: "Ourocard Platinum" }, localCard)).toBe(
      true,
    );
  });

  it("shows field errors below invalid inputs", () => {
    const fields = buildCardCompletionFields(payload, emptyAppData()).slice(0, 1);
    const errors = validateCardCompletionDrafts(fields, {
      card_ourocard: { closingDay: "40", dueDay: "abc" },
    });
    expect(errors.card_ourocard?.closingDay).toBeDefined();
    expect(errors.card_ourocard?.dueDay).toBeDefined();
    const html = renderCardCompletionSection(fields, { card_ourocard: { closingDay: "40", dueDay: "abc" } }, errors);
    expect(html).toContain("field__error");
  });

  it("syncs validation without replacing inputs", () => {
    const fields = buildCardCompletionFields(payload, emptyAppData()).slice(0, 1);
    document.body.innerHTML = renderCardCompletionSection(fields, {}, {});
    const root = document.body;
    const input = root.querySelector<HTMLInputElement>("[data-card-completion-field='closingDay']")!;
    const nodeRef = input;
    input.value = "40";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    syncCardCompletionValidation(
      root,
      fields,
      { card_ourocard: { closingDay: "40", dueDay: "" } },
      true,
    );
    expect(root.querySelector("[data-card-completion-field='closingDay']")).toBe(nodeRef);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(root.querySelector(".field__error")).not.toBeNull();
  });
});
