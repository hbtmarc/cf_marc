import type { AppData } from "../types";
import type { AppMutations } from "../forms";
import { applyImportPlan, buildImportPlan, cloneAppData } from "../import";
import type { ImportPlan, ImportResult } from "../import-types";
import { parseImportJson, validateImportDocument, formatGeneratedAtLabel } from "../import-validate";
import { announce, escapeHtml } from "../ui";

type ImportView = "empty" | "review" | "result";

interface ImportPageState {
  view: ImportView;
  fileName: string;
  plan: ImportPlan | null;
  result: ImportResult | null;
}

let pageState: ImportPageState = {
  view: "empty",
  fileName: "",
  plan: null,
  result: null,
};

function resetState(): void {
  pageState = {
    view: "empty",
    fileName: "",
    plan: null,
    result: null,
  };
}

function renderCompetenceList(months: string[]): string {
  if (months.length === 0) {
    return "—";
  }
  return months.map((item) => escapeHtml(item)).join(", ");
}

function renderReview(plan: ImportPlan): string {
  const { summary } = plan;
  const { counts, planCounts } = summary;
  return `
    <section class="import-review" aria-live="polite">
      <header class="section-header">
        <h2 class="section-header__title">Revisão do arquivo</h2>
        <p class="section-header__meta">${escapeHtml(summary.fileName)}</p>
      </header>
      <dl class="import-summary__meta">
        <div><dt>Gerado em</dt><dd>${escapeHtml(formatGeneratedAtLabel(summary.generatedAt))}</dd></div>
        <div><dt>Moeda</dt><dd>${escapeHtml(summary.currency)}</dd></div>
        <div><dt>Competências</dt><dd>${renderCompetenceList(summary.competenceMonths)}</dd></div>
      </dl>
      <dl class="import-summary__counts import-summary__counts--wide">
        <div><dt>Rendas</dt><dd>${counts.incomes}</dd></div>
        <div><dt>Cartões</dt><dd>${counts.cards}</dd></div>
        <div><dt>Faturas</dt><dd>${counts.invoices}</dd></div>
        <div><dt>Despesas</dt><dd>${counts.expenses}</dd></div>
        <div><dt>Expense</dt><dd>${counts.expenseByKind.expense}</dd></div>
        <div><dt>Fee</dt><dd>${counts.expenseByKind.fee}</dd></div>
        <div><dt>Refund</dt><dd>${counts.expenseByKind.refund}</dd></div>
        <div><dt>Parcelas</dt><dd>${counts.installments}</dd></div>
        <div><dt>Fingerprints únicos</dt><dd>${counts.uniqueFingerprints}</dd></div>
      </dl>
      <dl class="import-summary__counts">
        <div><dt>Novos</dt><dd>${planCounts.new}</dd></div>
        <div><dt>Atualizados</dt><dd>${planCounts.updated}</dd></div>
        <div><dt>Já existentes</dt><dd>${planCounts.existing}</dd></div>
        <div><dt>Conflitos</dt><dd>${planCounts.conflicts}</dd></div>
      </dl>
      ${
        summary.warnings.length > 0
          ? `<div class="import-message import-message--warning" role="status"><strong>Avisos</strong><ul>${summary.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
          : ""
      }
      ${
        summary.errors.length > 0
          ? `<div class="import-message import-message--error" role="alert"><strong>Erros bloqueantes</strong><ul>${summary.errors.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
          : ""
      }
      <div class="import-review__actions">
        <button type="button" class="btn btn--secondary" id="import-cancel-review">Trocar arquivo</button>
        <button type="button" class="btn btn--primary" id="import-confirm" ${plan.canImport ? "" : "disabled"}>Importar dados</button>
      </div>
    </section>
  `;
}

function renderResult(result: ImportResult): string {
  return `
    <section class="import-result" aria-live="polite">
      <header class="section-header">
        <h2 class="section-header__title">Importação concluída</h2>
      </header>
      <dl class="import-summary__counts">
        <div><dt>Criados</dt><dd>${result.created}</dd></div>
        <div><dt>Já existentes</dt><dd>${result.existing}</dd></div>
        <div><dt>Atualizados</dt><dd>${result.updated}</dd></div>
        <div><dt>Conflitos ignorados</dt><dd>${result.conflicts}</dd></div>
      </dl>
      ${
        result.errors.length > 0
          ? `<div class="import-message import-message--error" role="alert"><ul>${result.errors.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
          : ""
      }
      <div class="import-review__actions">
        <button type="button" class="btn btn--secondary" id="import-new-file">Importar outro arquivo</button>
        <a class="btn btn--primary" href="#/dashboard">Ir para o Dashboard</a>
      </div>
    </section>
  `;
}

function renderEmpty(): string {
  return `
    <section class="import-panel">
      <div
        class="import-dropzone"
        id="import-dropzone"
        tabindex="0"
        role="button"
        aria-label="Selecionar ou arrastar arquivo JSON cfm.import.v1"
      >
        <p class="import-dropzone__title">Arraste um arquivo JSON aqui</p>
        <p class="import-dropzone__hint">Somente arquivos no contrato <code>cfm.import.v1</code>.</p>
        <button type="button" class="btn btn--primary" id="import-select-file">Selecionar arquivo</button>
        <input class="sr-only" type="file" id="import-file-input" accept=".json,application/json" />
      </div>
      <p class="import-panel__note">O processamento ocorre localmente neste dispositivo. Nenhum dado é enviado a servidores.</p>
    </section>
  `;
}

function renderPage(host: HTMLElement): void {
  host.innerHTML = "";
  if (pageState.view === "review" && pageState.plan) {
    host.innerHTML = renderReview(pageState.plan);
  } else if (pageState.view === "result" && pageState.result) {
    host.innerHTML = renderResult(pageState.result);
  } else {
    host.innerHTML = renderEmpty();
  }
}

async function handleFile(
  file: File,
  currentData: AppData,
  rerender: () => void,
): Promise<void> {
  const text = await file.text();
  const parsed = parseImportJson(text);
  if (!parsed.ok) {
    pageState = {
      view: "review",
      fileName: file.name,
      plan: null,
      result: null,
    };
    const host = document.getElementById("main-content");
    if (host) {
      host.innerHTML = `
        <section class="import-review">
          <div class="import-message import-message--error" role="alert">
            <strong>Arquivo inválido</strong>
            <p>${escapeHtml(parsed.message)}</p>
          </div>
          <div class="import-review__actions">
            <button type="button" class="btn btn--secondary" id="import-new-file">Tentar novamente</button>
          </div>
        </section>
      `;
      bindResultActions(rerender);
    }
    announce(parsed.message);
    return;
  }

  const validated = validateImportDocument(parsed.value, file.name);
  if (!validated.ok) {
    pageState = {
      view: "review",
      fileName: file.name,
      plan: {
        payload: {
          schemaVersion: "cfm.import.v1",
          generatedAt: validated.summary.generatedAt,
          currency: validated.summary.currency,
          incomes: [],
          cards: [],
          invoices: [],
          expenses: [],
        },
        summary: { ...validated.summary, fileName: file.name },
        items: [],
        canImport: false,
      },
      result: null,
    };
    rerender();
    announce("Arquivo inválido. Revise os erros antes de importar.");
    return;
  }

  const previewData = cloneAppData(currentData);
  const plan = buildImportPlan(previewData, validated.payload, {
    ...validated.summary,
    fileName: file.name,
  });
  pageState = {
    view: "review",
    fileName: file.name,
    plan,
    result: null,
  };
  rerender();
  announce("Arquivo analisado. Revise o resumo antes de confirmar.");
}

function bindDropzone(
  host: HTMLElement,
  currentData: AppData,
  rerender: () => void,
): void {
  const dropzone = host.querySelector<HTMLElement>("#import-dropzone");
  const input = host.querySelector<HTMLInputElement>("#import-file-input");
  const selectBtn = host.querySelector<HTMLButtonElement>("#import-select-file");

  const openPicker = (): void => {
    input?.click();
  };

  selectBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    openPicker();
  });

  dropzone?.addEventListener("click", () => {
    openPicker();
  });

  dropzone?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  });

  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) {
      void handleFile(file, currentData, rerender);
      input.value = "";
    }
  });

  dropzone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("import-dropzone--active");
  });

  dropzone?.addEventListener("dragleave", () => {
    dropzone.classList.remove("import-dropzone--active");
  });

  dropzone?.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("import-dropzone--active");
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void handleFile(file, currentData, rerender);
    }
  });
}

function bindReviewActions(
  host: HTMLElement,
  mutations: AppMutations,
  getData: () => AppData,
  rerender: () => void,
): void {
  host.querySelector<HTMLButtonElement>("#import-cancel-review")?.addEventListener("click", () => {
    resetState();
    rerender();
  });

  host.querySelector<HTMLButtonElement>("#import-confirm")?.addEventListener("click", () => {
    if (!pageState.plan?.canImport) {
      return;
    }
    const snapshot = cloneAppData(getData());
    const result = applyImportPlan(snapshot, pageState.plan);
    if (result.errors.length > 0) {
      announce(result.errors[0] ?? "Falha na importação.");
      return;
    }
    mutations.update((data) => {
      Object.assign(data, snapshot);
    });
    pageState = {
      view: "result",
      fileName: pageState.fileName,
      plan: pageState.plan,
      result,
    };
    rerender();
    announce("Importação concluída com sucesso.");
  });
}

function bindResultActions(rerender: () => void): void {
  document.querySelector<HTMLButtonElement>("#import-new-file")?.addEventListener("click", () => {
    resetState();
    rerender();
  });
}

export function renderImportar(
  host: HTMLElement,
  getData: () => AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  renderPage(host);

  if (pageState.view === "empty") {
    bindDropzone(host, getData(), rerender);
  } else if (pageState.view === "review") {
    bindReviewActions(host, mutations, getData, rerender);
    bindResultActions(rerender);
  } else if (pageState.view === "result") {
    bindResultActions(rerender);
  }
}

export function resetImportarPage(): void {
  resetState();
}
