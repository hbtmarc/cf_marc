import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fixtureDocument from "./fixtures/cfm-import-v1-valid.json";
import { buildImportPlan } from "./import";
import { validateImportDocument } from "./import-validate";
import { emptyAppData } from "./storage";
import type { ImportPayload } from "./import-types";
import {
  getImportPageStateForTests,
  renderImportar,
  resetImportarPage,
  setImportCardDraftsForTests,
} from "./pages/importar";
import type { AppMutations } from "./forms";

const payload = fixtureDocument as ImportPayload;
const mutations: AppMutations = { update: () => {} };

function renderReviewHost(): HTMLElement {
  const validated = validateImportDocument(payload, "fixture.json");
  expect(validated.ok).toBe(true);
  if (!validated.ok) {
    throw new Error("invalid fixture");
  }
  const data = emptyAppData();
  const plan = buildImportPlan(data, validated.payload, {
    ...validated.summary,
    fileName: "fixture.json",
  });
  resetImportarPage();
  Object.assign(getImportPageStateForTests(), {
    view: "review",
    fileName: "fixture.json",
    plan,
    result: null,
    cardDrafts: {},
  });
  const host = document.createElement("div");
  const rerender = (): void => {
    renderImportar(host, () => data, mutations, rerender);
  };
  rerender();
  return host;
}

describe("import card completion input focus", () => {
  beforeEach(() => {
    resetImportarPage();
  });

  afterEach(() => {
    resetImportarPage();
  });

  it('keeps "10" and "31" while typing without losing focus', () => {
    const host = renderReviewHost();
    const input = host.querySelector<HTMLInputElement>(
      '[data-card-completion="card_ourocard"][data-card-completion-field="closingDay"]',
    );
    expect(input).not.toBeNull();
    const nodeRef = input!;
    input!.focus();

    for (const char of "10") {
      input!.value += char;
      input!.dispatchEvent(new Event("input", { bubbles: true }));
      expect(host.querySelector('[data-card-completion="card_ourocard"][data-card-completion-field="closingDay"]')).toBe(nodeRef);
    }
    expect(input!.value).toBe("10");

    input!.value = "";
    for (const char of "31") {
      input!.value += char;
      input!.dispatchEvent(new Event("input", { bubbles: true }));
      expect(host.querySelector('[data-card-completion="card_ourocard"][data-card-completion-field="closingDay"]')).toBe(nodeRef);
    }
    expect(input!.value).toBe("31");
  });

  it("keeps the same DOM node across input events", () => {
    const host = renderReviewHost();
    const input = host.querySelector<HTMLInputElement>(
      '[data-card-completion="card_ourocard"][data-card-completion-field="dueDay"]',
    )!;
    const nodeRef = input;
    input.value = "1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.value = "15";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(host.querySelector('[data-card-completion="card_ourocard"][data-card-completion-field="dueDay"]')).toBe(nodeRef);
    expect(input.value).toBe("15");
  });

  it("does not recreate sibling card inputs when one field changes", () => {
    const host = renderReviewHost();
    const porto = host.querySelector<HTMLInputElement>(
      '[data-card-completion="card_porto"][data-card-completion-field="closingDay"]',
    );
    const mercado = host.querySelector<HTMLInputElement>(
      '[data-card-completion="card_mercado_pago"][data-card-completion-field="dueDay"]',
    );
    expect(porto).not.toBeNull();
    expect(mercado).not.toBeNull();
    const portoRef = porto!;
    const mercadoRef = mercado!;

    const ouro = host.querySelector<HTMLInputElement>(
      '[data-card-completion="card_ourocard"][data-card-completion-field="closingDay"]',
    )!;
    ouro.value = "5";
    ouro.dispatchEvent(new Event("input", { bubbles: true }));

    expect(host.querySelector('[data-card-completion="card_porto"][data-card-completion-field="closingDay"]')).toBe(portoRef);
    expect(host.querySelector('[data-card-completion="card_mercado_pago"][data-card-completion-field="dueDay"]')).toBe(mercadoRef);
  });

  it("updates validation and import button disabled state without rerendering inputs", () => {
    const host = renderReviewHost();
    const confirm = host.querySelector<HTMLButtonElement>("#import-confirm");
    expect(confirm?.disabled).toBe(true);

    const closing = host.querySelector<HTMLInputElement>(
      '[data-card-completion="card_ourocard"][data-card-completion-field="closingDay"]',
    )!;
    const due = host.querySelector<HTMLInputElement>(
      '[data-card-completion="card_ourocard"][data-card-completion-field="dueDay"]',
    )!;
    closing.value = "40";
    closing.dispatchEvent(new Event("input", { bubbles: true }));
    expect(closing.getAttribute("aria-invalid")).toBe("true");
    expect(confirm?.disabled).toBe(true);

    closing.value = "10";
    closing.dispatchEvent(new Event("input", { bubbles: true }));
    due.value = "15";
    due.dispatchEvent(new Event("input", { bubbles: true }));
    expect(closing.getAttribute("aria-invalid")).toBe("false");
    expect(confirm?.disabled).toBe(true);

    host.querySelector<HTMLInputElement>(
      '[data-card-completion="card_porto"][data-card-completion-field="closingDay"]',
    )!.value = "5";
    host
      .querySelector<HTMLInputElement>(
        '[data-card-completion="card_porto"][data-card-completion-field="closingDay"]',
      )!
      .dispatchEvent(new Event("input", { bubbles: true }));
    host.querySelector<HTMLInputElement>(
      '[data-card-completion="card_mercado_pago"][data-card-completion-field="dueDay"]',
    )!.value = "12";
    host
      .querySelector<HTMLInputElement>(
        '[data-card-completion="card_mercado_pago"][data-card-completion-field="dueDay"]',
      )!
      .dispatchEvent(new Event("input", { bubbles: true }));
    expect(confirm?.disabled).toBe(false);
  });

  it("does not accumulate listeners when reopening review", () => {
    const data = emptyAppData();
    const host = document.createElement("div");
    let inputEvents = 0;
    const rerender = (): void => {
      renderImportar(host, () => data, mutations, rerender);
    };

    const validated = validateImportDocument(payload, "fixture.json");
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }
    const plan = buildImportPlan(data, validated.payload, {
      ...validated.summary,
      fileName: "fixture.json",
    });
    Object.assign(getImportPageStateForTests(), {
      view: "review",
      fileName: "fixture.json",
      plan,
      result: null,
      cardDrafts: {},
    });
    rerender();

    host.addEventListener(
      "input",
      (event) => {
        if (
          event.target instanceof HTMLInputElement &&
          event.target.matches("[data-card-completion]")
        ) {
          inputEvents += 1;
        }
      },
      true,
    );

    const input = host.querySelector<HTMLInputElement>("[data-card-completion]")!;
    input.value = "1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(inputEvents).toBe(1);

    resetImportarPage();
    Object.assign(getImportPageStateForTests(), {
      view: "review",
      fileName: "fixture.json",
      plan,
      result: null,
      cardDrafts: {},
    });
    rerender();
    const inputAgain = host.querySelector<HTMLInputElement>("[data-card-completion]")!;
    inputAgain.value = "2";
    inputAgain.dispatchEvent(new Event("input", { bubbles: true }));
    expect(inputEvents).toBe(2);
  });

  it("stores drafts in page state while typing", () => {
    const host = renderReviewHost();
    const input = host.querySelector<HTMLInputElement>(
      '[data-card-completion="card_ourocard"][data-card-completion-field="closingDay"]',
    )!;
    input.value = "10";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(getImportPageStateForTests().cardDrafts.card_ourocard?.closingDay).toBe("10");
    setImportCardDraftsForTests({});
    expect(getImportPageStateForTests().cardDrafts).toEqual({});
  });
});
